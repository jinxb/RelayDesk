use crate::models::SidecarHttpRequest;
use crate::sidecar::{sidecar_request_internal, SidecarStore};
use serde_json::Value;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn sidecar_request<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SidecarStore>,
    request: SidecarHttpRequest,
) -> Result<Value, String> {
    sidecar_request_internal(&app, &state, &request)
}
