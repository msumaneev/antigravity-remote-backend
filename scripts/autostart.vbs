Set WshShell = CreateObject("WScript.Shell")
' Run the backend server completely hidden
WshShell.Run "cmd /c cd """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\..\..\backend"" && npm start", 0, False
