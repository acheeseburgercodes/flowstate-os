use serde::Serialize;

#[derive(Debug, Serialize)]
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
    fn actual_windows_can_be_enumerated() {
        let windows = super::enumerate().expect("Win32 enumeration failed");
        assert!(windows
            .iter()
            .all(|window| !window.title.is_empty() && window.process_id > 0));
    }
}
