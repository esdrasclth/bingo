const socket = io();

let all = [];

function draw() {
    socket.emit("draw");
}

function reset() {
    socket.emit("reset");
}

function setPattern() {
    let pattern = document.getElementById("patternSelect").value;
    socket.emit("setPattern", pattern);
}

socket.on("pattern", (p) => {
    document.getElementById("currentPattern").innerText =
        "Patrón actual: " + p;
});

socket.on("currentNumber", (num) => {
    all.push(num);
    document.getElementById("numbers").innerHTML =
        all.map(n => `<span>${n}</span>`).join(" ");
});

socket.on("winner", (data) => {
    document.getElementById("winner").innerText =
        "🏆 GANÓ CARTÓN #" + data.cardId;
});

socket.on("reset", () => {
    all = [];
    document.getElementById("numbers").innerHTML = "";
    document.getElementById("winner").innerText = "";
});