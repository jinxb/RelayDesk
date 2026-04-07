use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const TRAY_ICON_ID: &str = "relaydesk-tray";
pub const TRAY_SHOW_ID: &str = "tray-show";
pub const TRAY_HIDE_ID: &str = "tray-hide";
pub const TRAY_QUIT_ID: &str = "tray-quit";

#[derive(Serialize)]
pub struct ShellIdentity<'a> {
    pub name: &'a str,
    pub release: &'a str,
}

impl ShellIdentity<'static> {
    pub fn current() -> Self {
        Self {
            name: "RelayDesk",
            release: env!("CARGO_PKG_VERSION"),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct SidecarSnapshot {
    pub running: bool,
    pub pid: Option<u32>,
}

impl SidecarSnapshot {
    pub fn running(pid: u32) -> Self {
        Self {
            running: true,
            pid: Some(pid),
        }
    }

    pub fn stopped() -> Self {
        Self {
            running: false,
            pid: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRequest {
    pub path: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPickerRequest {
    pub title: Option<String>,
    pub starting_path: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarHttpRequest {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
}

#[derive(Deserialize)]
pub struct SidecarRpcResponse {
    pub ok: bool,
    pub payload: Option<Value>,
    pub error: Option<String>,
}
