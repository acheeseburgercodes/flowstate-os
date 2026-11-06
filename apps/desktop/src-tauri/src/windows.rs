use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowInfo {
    pub handle: String,
    pub process_id: u32,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub minimized: bool,
    pub maximized: bool,
    pub process_started: Option<u64>,
}

#[cfg(windows)]
pub fn enumerate() -> Result<Vec<WindowInfo>, String> {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> i32 {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return 1;
        }
        let mut title = vec![0u16; (length as usize + 1).min(32768)];
        let read = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
        if read <= 0 {
            return 1;
        }
        let mut bounds = RECT::default();
        if GetWindowRect(hwnd, &mut bounds) == 0 {
            return 1;
        }
        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, &mut process_id);
        let output = &mut *(data as *mut Vec<WindowInfo>);
        output.push(WindowInfo {
            handle: format!("{:x}", hwnd as usize),
            process_id,
            title: String::from_utf16_lossy(&title[..read as usize]),
            x: bounds.left,
            y: bounds.top,
            width: bounds.right - bounds.left,
            height: bounds.bottom - bounds.top,
            minimized: IsIconic(hwnd) != 0,
            maximized: IsZoomed(hwnd) != 0,
            process_started: process_identity(process_id),
        });
        1
    }

    let mut output: Vec<WindowInfo> = Vec::new();
    // EnumWindows is synchronous; the vector pointer stays alive for every callback.
    let success = unsafe { EnumWindows(Some(visit), &mut output as *mut _ as isize) };
    if success == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(output)
}

#[cfg(not(windows))]
pub fn enumerate() -> Result<Vec<WindowInfo>, String> {
    Err("Native discovery is supported on Windows only".into())
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn restores_only_a_disposable_test_window() {
        use windows_sys::Win32::UI::WindowsAndMessaging::*;
        let class: Vec<u16> = "STATIC".encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "FlowState native positioning test"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        unsafe {
            let hwnd = CreateWindowExW(
                0,
                class.as_ptr(),
                title.as_ptr(),
                WS_OVERLAPPEDWINDOW,
                120,
                120,
                400,
                300,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            );
            assert!(!hwnd.is_null());
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            let handle = format!("{:x}", hwnd as usize);
            let original = super::enumerate()
                .unwrap()
                .into_iter()
                .find(|window| window.handle == handle)
                .unwrap();
            let mut target = original.clone();
            target.x += 40;
            target.y += 40;
            target.width += 80;
            let moved = super::restore_bounds(&target);
            let restored = super::restore_bounds(&original);
            DestroyWindow(hwnd);
            moved.expect("Move test-owned window and verify actual bounds");
            restored.expect("Restore test-owned window and verify actual bounds");
            assert!(
                super::restore_bounds(&original).is_err(),
                "Closed handles must be rejected"
            );
        }
    }

    #[test]
    fn actual_windows_can_be_enumerated() {
        let windows = super::enumerate().expect("Win32 enumeration failed");
        assert!(windows
            .iter()
            .all(|window| !window.title.is_empty() && window.process_id > 0));
    }
}

pub fn same_window(saved: &WindowInfo, current: &WindowInfo) -> bool {
    saved.handle == current.handle
        && saved.process_id == current.process_id
        && saved.process_started.is_some()
        && saved.process_started == current.process_started
        && saved.title == current.title
}

#[cfg(windows)]
fn process_identity(pid: u32) -> Option<u64> {
    use windows_sys::Win32::{Foundation::*, System::Threading::*};
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }
        let mut created = FILETIME::default();
        let mut exited = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let success = GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user);
        CloseHandle(process);
        (success != 0)
            .then_some(((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64)
    }
}

#[cfg(windows)]
fn can_manage(pid: u32) -> bool {
    use windows_sys::Win32::{Foundation::*, Security::*, System::Threading::*};
    unsafe {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return false;
        }
        let mut token = std::ptr::null_mut();
        let opened = OpenProcessToken(process, TOKEN_QUERY, &mut token);
        CloseHandle(process);
        if opened == 0 {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut length = 0;
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut length,
        );
        CloseHandle(token);
        result != 0 && elevation.TokenIsElevated == 0
    }
}

#[cfg(windows)]
pub fn confirm_restore(name: &str, count: usize) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;
    let message: Vec<u16> = format!("Restore {count} captured windows from '{name}'?\n\nOnly matching, non-elevated, normal windows can be moved. A rollback snapshot is saved first. Applications will not be launched or closed.").encode_utf16().chain(Some(0)).collect();
    let title: Vec<u16> = "FlowState — approve window changes"
        .encode_utf16()
        .chain(Some(0))
        .collect();
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2 | MB_TOPMOST,
        ) == IDYES
    }
}

#[cfg(windows)]
pub fn restore_bounds(saved: &WindowInfo) -> Result<(), String> {
    use windows_sys::Win32::{Foundation::*, Graphics::Gdi::*, UI::WindowsAndMessaging::*};
    if saved.minimized || saved.maximized {
        return Err("Only normal window bounds are supported in this version".into());
    }
    let current = enumerate()?
        .into_iter()
        .find(|window| same_window(saved, window))
        .ok_or("Window closed, title changed, or process identity no longer matches")?;
    if current.minimized || current.maximized {
        return Err("Restore this window to normal state before applying its saved bounds".into());
    }
    if !can_manage(saved.process_id) {
        return Err("Elevated or inaccessible process cannot be managed".into());
    }
    if saved.width < 100 || saved.height < 100 || saved.width > 32768 || saved.height > 32768 {
        return Err("Unsupported window dimensions".into());
    }
    let right = saved
        .x
        .checked_add(saved.width)
        .ok_or("Invalid coordinates")?;
    let bottom = saved
        .y
        .checked_add(saved.height)
        .ok_or("Invalid coordinates")?;
    let rectangle = RECT {
        left: saved.x,
        top: saved.y,
        right,
        bottom,
    };
    let hwnd =
        usize::from_str_radix(&saved.handle, 16).map_err(|_| "Invalid window handle")? as HWND;
    unsafe {
        if MonitorFromRect(&rectangle, MONITOR_DEFAULTTONULL).is_null() {
            return Err("Saved bounds are outside the connected monitors".into());
        }
        if hwnd == GetShellWindow() || hwnd == GetDesktopWindow() {
            return Err("System windows cannot be moved".into());
        }
        if SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            saved.x,
            saved.y,
            saved.width,
            saved.height,
            SWP_NOACTIVATE | SWP_NOZORDER | SWP_ASYNCWINDOWPOS,
        ) == 0
        {
            return Err(std::io::Error::last_os_error().to_string());
        }
    }
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Some(actual) = enumerate()?
            .into_iter()
            .find(|window| same_window(saved, window))
        {
            if actual.x == saved.x
                && actual.y == saved.y
                && actual.width == saved.width
                && actual.height == saved.height
            {
                return Ok(());
            }
        }
    }
    Err("The application did not reach the requested bounds within one second".into())
}

#[cfg(not(windows))]
pub fn confirm_restore(_: &str, _: usize) -> bool {
    false
}
#[cfg(not(windows))]
pub fn restore_bounds(_: &WindowInfo) -> Result<(), String> {
    Err("Windows is required".into())
}
