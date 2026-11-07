use crate::{snapshots, windows};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Monitor {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
}

#[cfg(windows)]
pub struct DpiScope(isize);
#[cfg(windows)]
impl DpiScope {
    pub fn enter() -> Result<Self, String> {
        use windows_sys::Win32::UI::HiDpi::*;
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.is_null() {
            return Err("Unable to establish per-monitor DPI coordinates".into());
        }
        Ok(Self(previous as isize))
    }
}
#[cfg(windows)]
impl Drop for DpiScope {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::UI::HiDpi::SetThreadDpiAwarenessContext(self.0 as _);
        }
    }
}

#[cfg(windows)]
pub fn monitors() -> Result<Vec<Monitor>, String> {
    use windows_sys::Win32::{Foundation::*, Graphics::Gdi::*};
    let _dpi = DpiScope::enter()?;
    unsafe extern "system" fn visit(monitor: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> i32 {
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return 1;
        }
        let output = &mut *(data as *mut Vec<Monitor>);
        output.push(Monitor {
            id: format!("{:x}", monitor as usize),
            x: info.rcWork.left,
            y: info.rcWork.top,
            width: info.rcWork.right - info.rcWork.left,
            height: info.rcWork.bottom - info.rcWork.top,
            primary: info.dwFlags & 1 != 0,
        });
        1
    }
    let mut result: Vec<Monitor> = vec![];
    if unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(visit),
            &mut result as *mut _ as isize,
        )
    } == 0
    {
        return Err("Monitor discovery failed".into());
    }
    Ok(result)
}
#[cfg(not(windows))]
pub fn monitors() -> Result<Vec<Monitor>, String> {
    Err("Windows is required".into())
}

fn rectangles(
    monitor: &Monitor,
    count: usize,
    layout: &str,
) -> Result<Vec<(i32, i32, i32, i32)>, String> {
    let required = match layout {
        "focus" | "presentation" => 1,
        "split" | "coding" | "research" => 2,
        "triple" => 3,
        _ => return Err("Unsupported layout".into()),
    };
    if count != required {
        return Err(format!(
            "This layout requires exactly {required} selected windows"
        ));
    }
    if monitor.width < 600 || monitor.height < 300 {
        return Err("Display work area is too small".into());
    }
    let gap = 8;
    let usable = monitor.width - gap * (count as i32 + 1);
    let mut x = monitor.x + gap;
    let mut result = vec![];
    for index in 0..count {
        let width = if index == count - 1 {
            monitor.x + monitor.width - gap - x
        } else if layout == "coding" {
            usable * 2 / 3
        } else if layout == "research" {
            usable * 3 / 5
        } else {
            usable / count as i32
        };
        result.push((x, monitor.y + gap, width, monitor.height - gap * 2));
        x += width + gap;
    }
    Ok(result)
}

pub fn preview(
    handles: Vec<String>,
    monitor_id: String,
    layout: String,
) -> Result<Vec<windows::WindowInfo>, String> {
    let monitor = monitors()?
        .into_iter()
        .find(|monitor| monitor.id == monitor_id)
        .ok_or("Display is no longer connected")?;
    let bounds = rectangles(&monitor, handles.len(), &layout)?;
    let current = windows::enumerate()?;
    let mut result = vec![];
    let mut seen = std::collections::HashSet::new();
    for (handle, (x, y, width, height)) in handles.into_iter().zip(bounds) {
        if !seen.insert(handle.clone()) {
            return Err("Select distinct windows".into());
        }
        let mut window = current
            .iter()
            .find(|window| window.handle == handle)
            .ok_or("A selected window closed")?
            .clone();
        if window.minimized || window.maximized || window.process_started.is_none() {
            return Err("Select accessible windows in normal state".into());
        }
        window.x = x;
        window.y = y;
        window.width = width;
        window.height = height;
        result.push(window);
    }
    Ok(result)
}

pub fn arrange(
    path: &Path,
    handles: Vec<String>,
    monitor_id: String,
    layout: String,
) -> Result<snapshots::RestoreResult, String> {
    let _guard = snapshots::RESTORE_LOCK
        .try_lock()
        .map_err(|_| "Another window operation is awaiting approval or running")?;
    let target = preview(handles.clone(), monitor_id, layout.clone())?;
    let details = target
        .iter()
        .map(|window| {
            format!(
                "{}: {} × {} at {}, {}",
                window.title, window.width, window.height, window.x, window.y
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    if !windows::confirm_action(&format!("Arrange these windows using the {layout} layout?\n\n{details}\n\nA rollback snapshot will be saved first.")) { return Err("Arrangement cancelled".into()); }
    let rollback = snapshots::capture(path, "Before window arrangement".into(), handles)?;
    let results = target
        .iter()
        .map(|window| match windows::restore_bounds(window) {
            Ok(()) => snapshots::ActionResult {
                title: window.title.clone(),
                success: true,
                detail: "Layout bounds verified".into(),
            },
            Err(detail) => snapshots::ActionResult {
                title: window.title.clone(),
                success: false,
                detail,
            },
        })
        .collect();
    Ok(snapshots::RestoreResult {
        rollback_snapshot_id: rollback.id,
        results,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn layouts_respect_negative_monitor_origins_and_work_area() {
        let monitor = super::Monitor {
            id: "test".into(),
            x: -1920,
            y: -200,
            width: 1920,
            height: 1040,
            primary: false,
        };
        for (layout, count) in [
            ("focus", 1),
            ("split", 2),
            ("coding", 2),
            ("research", 2),
            ("triple", 3),
        ] {
            let bounds = super::rectangles(&monitor, count, layout).unwrap();
            assert_eq!(bounds[0].0, -1912);
            for (x, y, w, h) in bounds {
                assert!(
                    x >= monitor.x
                        && y >= monitor.y
                        && x + w <= monitor.x + monitor.width
                        && y + h <= monitor.y + monitor.height
                );
            }
        }
        assert!(super::rectangles(&monitor, 1, "coding").is_err());
    }
    #[cfg(windows)]
    #[test]
    fn reads_actual_monitor_work_areas() {
        assert!(super::monitors()
            .unwrap()
            .iter()
            .any(|monitor| monitor.primary && monitor.width > 0 && monitor.height > 0));
    }
}
