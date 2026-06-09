const socket = io();

let card = null;
let drawnNumbers = [];
let marked = [];
let currentPattern = "FULL";

socket.on("card", (c) => {
    card = c;
    document.getElementById("cardId").innerText = c.id;
    renderCard();
});

socket.on("pattern", (p) => {
    currentPattern = p;
    document.getElementById("status").innerText =
        "🎯 Patrón: " + p;
});

socket.on("currentNumber", (num) => {
    document.getElementById("current").innerText = num;
    drawnNumbers.push(num);
});

socket.on("players", (p) => {
    document.getElementById("players").innerText = p;
});

socket.on("winner", (data) => {
    if (socket.id === data.player) {
        document.getElementById("confetti").style.display = "block";
    }
    alert("🏆 GANADOR: Cartón #" + data.cardId);
});

socket.on("reset", () => {
    drawnNumbers = [];
    marked = [];
    document.getElementById("current").innerText = "";
    document.getElementById("confetti").style.display = "none";
    renderCard();
});

function renderCard() {
    if (!card) return;

    let html = "<table>";

    for (let r = 0; r < 5; r++) {
        html += "<tr>";

        for (let c = 0; c < 5; c++) {
            let value = card.data[c][r];

            let isMarked =
                value === "FREE" || marked.includes(value);

            html += `<td onclick="mark('${value}', this)"
                class="${isMarked ? 'marked' : ''}">
                ${value}
            </td>`;
        }

        html += "</tr>";
    }

    html += "</table>";

    document.getElementById("card").innerHTML = html;
}

function mark(num, el) {
    if (num === "FREE") return;

    num = Number(num);

    if (!drawnNumbers.includes(num)) {
        alert("❌ Este número aún no ha salido");
        return;
    }

    if (marked.includes(num)) {
        marked = marked.filter(n => n !== num);
        el.classList.remove("marked");
    } else {
        marked.push(num);
        el.classList.add("marked");
    }
}

function checkBingo() {
    if (!card) return;

    socket.emit("checkBingo", {
        card,
        marked
    });
}