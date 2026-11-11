; Custom NSIS hooks for electron-builder's assisted installer (package.json build.nsis.include).

; The assisted installer would name the folder "PDF Edit"; keep the old one-click folder name so
; reinstalling over an existing install doesn't nest "...\pdfedit\PDF Edit".
!undef APP_FILENAME
!define APP_FILENAME "pdfedit"

; Page after the directory page: "create desktop shortcut" checkbox (default checked).
; Silent installs never show it, so they keep electron-builder's behaviour: fresh install creates the
; shortcut, --updated keeps whatever shortcuts the user has (KeepShortcuts / --keep-shortcuts).
!macro customPageAfterChangeDir
  Var desktopShortcutCheckbox
  Var noDesktopShortcut

  Page custom desktopShortcutPageCreate desktopShortcutPageLeave

  Function desktopShortcutPageCreate
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "ทางลัด" "เลือกทางลัดที่ต้องการสร้าง"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0u 0u 100% 20u "ทางลัดในเมนู Start จะถูกสร้างเสมอ"
    Pop $0
    ${NSD_CreateCheckbox} 0u 24u 100% 12u "สร้างทางลัดบนเดสก์ท็อป"
    Pop $desktopShortcutCheckbox
    ${if} $noDesktopShortcut != "1"
      ${NSD_Check} $desktopShortcutCheckbox
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function desktopShortcutPageLeave
    ; An "only for me" (non-admin) install into e.g. C:\Program Files can't write there, and electron-builder
    ; would still report success with no files installed - stop here instead.
    ClearErrors
    CreateDirectory "$INSTDIR"
    FileOpen $0 "$INSTDIR\.pdfedit-write-test" w
    ${if} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "ไม่มีสิทธิ์ติดตั้งลงในโฟลเดอร์นี้:$\r$\n$INSTDIR$\r$\n$\r$\nหากต้องการติดตั้งใน Program Files ให้กด Back แล้วเลือก$\r$\n$\"Anyone who uses this computer (all users)$\" หรือเลือกโฟลเดอร์อื่น"
      Abort
    ${endif}
    FileClose $0
    Delete "$INSTDIR\.pdfedit-write-test"

    ${NSD_GetState} $desktopShortcutCheckbox $0
    ${if} $0 == ${BST_CHECKED}
      StrCpy $noDesktopShortcut "0"
    ${else}
      StrCpy $noDesktopShortcut "1"
    ${endif}
  FunctionEnd
!macroend

; electron-builder has already created the desktop shortcut at this point; remove it if the user unticked the box.
!macro customInstall
  ${if} $noDesktopShortcut == "1"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endif}
!macroend
