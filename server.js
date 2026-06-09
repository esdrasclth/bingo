const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let numbers = Array.from({ length: 75 }, (_, i) => i + 1);
let drawn = [];
let players = {};
let gameLocked = false;

let usedCards = new Set();
let cardCounter = 1;

let currentPattern = "FULL";

// 🎫 CARTÓN 5x5 CON FREE
function generateCard() {
    let card;
    let key;

    do {
        card = [];
        let ranges = [
            [1, 15],
            [16, 30],
            [31, 45],
            [46, 60],
            [61, 75]
        ];

        for (let i = 0; i < 5; i++) {
            let nums = [];
            for (let n = ranges[i][0]; n <= ranges[i][1]; n++) nums.push(n);

            nums = nums.sort(() => Math.random() - 0.5).slice(0, 5);
            card.push(nums);
        }

        card[2][2] = "FREE";

        key = JSON.stringify(card);

    } while (usedCards.has(key));

    usedCards.add(key);

    return {
        id: cardCounter++,
        data: card
    };
}

// 🧠 VALIDACIÓN REAL DE PATRONES (USANDO MARCADO DEL JUGADOR)
function checkBingo(card, marked, pattern) {
    const size = 5;

    const idx = (r, c) => r * size + c;

    let grid = [];

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            let val = card[c][r];
            let isMarked = val === "FREE" || marked.includes(val);
            grid.push(isMarked);
        }
    }

    // 🔲 FULL
    if (pattern === "FULL") {
        return grid.every(Boolean);
    }

    // ➖ HORIZONTAL
    if (pattern === "HORIZONTAL") {
        for (let r = 0; r < size; r++) {
            let ok = true;
            for (let c = 0; c < size; c++) {
                if (!grid[idx(r, c)]) ok = false;
            }
            if (ok) return true;
        }
    }

    // ➕ VERTICAL
    if (pattern === "VERTICAL") {
        for (let c = 0; c < size; c++) {
            let ok = true;
            for (let r = 0; r < size; r++) {
                if (!grid[idx(r, c)]) ok = false;
            }
            if (ok) return true;
        }
    }

    // ✖ X
    if (pattern === "X") {
        let d1 = true;
        let d2 = true;

        for (let i = 0; i < size; i++) {
            if (!grid[idx(i, i)]) d1 = false;
            if (!grid[idx(i, size - 1 - i)]) d2 = false;
        }

        return d1 || d2;
    }

    // ➕ CRUZ
    if (pattern === "CROSS") {
        let mid = 2;

        let row = true;
        let col = true;

        for (let i = 0; i < size; i++) {
            if (!grid[idx(mid, i)]) row = false;
            if (!grid[idx(i, mid)]) col = false;
        }

        return row && col;
    }

    // 🔳 CUADRADO CENTRAL
    if (pattern === "CENTER_BOX") {
        for (let r = 1; r <= 3; r++) {
            for (let c = 1; c <= 3; c++) {
                if (!grid[idx(r, c)]) return false;
            }
        }
        return true;
    }

    return false;
}

io.on("connection", (socket) => {

    players[socket.id] = true;
    io.emit("players", Object.keys(players).length);

    let cardObj = generateCard();

    socket.emit("card", cardObj);
    socket.emit("numbers", drawn);
    socket.emit("pattern", currentPattern);

    socket.on("setPattern", (pattern) => {
        if (gameLocked) return;
        currentPattern = pattern;
        io.emit("pattern", currentPattern);
    });

    socket.on("draw", () => {
        if (gameLocked) return;
        if (numbers.length === 0) return;

        let index = Math.floor(Math.random() * numbers.length);
        let num = numbers.splice(index, 1)[0];

        drawn.push(num);

        io.emit("currentNumber", num);
    });

    // 🏆 BINGO CORREGIDO
    socket.on("checkBingo", (data) => {
        if (gameLocked) return;

        const { card, marked } = data;

        if (checkBingo(card.data, marked, currentPattern)) {
            gameLocked = true;

            io.emit("winner", {
                player: socket.id,
                cardId: card.id
            });
        }
    });

    socket.on("reset", () => {
        numbers = Array.from({ length: 75 }, (_, i) => i + 1);
        drawn = [];
        gameLocked = false;
        usedCards.clear();
        cardCounter = 1;
        currentPattern = "FULL";

        io.emit("reset");
        io.emit("pattern", currentPattern);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("players", Object.keys(players).length);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("🎱 Bingo PRO funcionando en puerto " + PORT);
});