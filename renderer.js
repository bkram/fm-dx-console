const term = new Terminal({ cursorBlink: true });
term.open(document.getElementById('terminal'));

electronAPI.onPtyData((data) => {
  term.write(data);
});

term.onData((data) => {
  electronAPI.ptyInput(data);
});

electronAPI.startConsole();
