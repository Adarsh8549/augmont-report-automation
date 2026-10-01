' Launches the Augmont webapp server hidden (no console window).
' Uses the FULL path to node.exe so it works regardless of PATH.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\Download\augmont-claude-code\webapp"
sh.Run """C:\Program Files\nodejs\node.exe"" server.js", 0, False
