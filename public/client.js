const socket = io();

let card = null;
let drawnNumbers = [];
let marcados = [];
let currentPattern = "FULL";
let bloqueado = false;
let miNombre = "";

const $ = id => document.getElementById(id);

/* ── Entrada: primero el nombre, luego la mesa ── */

const nombreGuardado = leerAlmacen(claveNombre);

if (nombreGuardado) {
    entrar(nombreGuardado);
} else {
    $("puertaNombre").hidden = false;
    $("nombre").focus();
}

$("nombreForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const valor = $("nombre").value.trim();
    if (!valor) return;

    guardarAlmacen(claveNombre, valor);
    $("puertaNombre").hidden = true;
    entrar(valor);
});

function entrar(nombre) {
    miNombre = nombre;

    // Solo entramos sobre una conexión viva. Emitir antes de "connect" deja el
    // paquete en el búfer y el orden frente a la desconexión previa deja de
    // estar garantizado, que es como el aforo acababa desfasado.
    if (socket.connected) unirseAMesa();
}

function unirseAMesa() {
    unirseASala(socket, "jugador", (respuesta) => {
        miNombre = respuesta.nombre || miNombre;
        $("datoNombre").innerText = miNombre;
        pintarBotonVoz($("vozBtn"));
    });
}

/* ── Estado que manda el servidor ── */

socket.on("card", (c) => {
    card = c;
    $("cardId").innerText = c.id;
    renderCard();
});

socket.on("marcados", (lista) => {
    marcados = Array.isArray(lista) ? lista.slice() : [];
    actualizarCasillas();
});

socket.on("estado", (estado) => {
    drawnNumbers = estado.drawn.slice();
    currentPattern = estado.pattern;
    bloqueado = estado.gameLocked;

    if (drawnNumbers.length) mostrarNumero(drawnNumbers[drawnNumbers.length - 1]);
    else $("current").innerText = "";

    $("status").innerText = etiquetaPatron(currentPattern);
    pintarMiniPatron($("miniPatron"), currentPattern);

    aplicarBloqueo(bloqueado);
    renderUltimas();
    actualizarCasillas();

    // Quien llega con la partida ya ganada también ve quién ganó
    if (estado.ganador) mostrarGanador(estado.ganador, false);
});

socket.on("pattern", (p) => {
    currentPattern = p;
    $("status").innerText = etiquetaPatron(p);
    pintarMiniPatron($("miniPatron"), p);
});

socket.on("currentNumber", (num) => {
    drawnNumbers.push(num);
    mostrarNumero(num);
    renderUltimas();
    actualizarCasillas();
    cantarNumero(num);
});

socket.on("players", (datos) => {
    $("players").innerText = datos.total;
});

socket.on("progreso", (datos) => {
    const faltan = datos && datos.faltan;
    const host = $("progreso");

    if (faltan === null || faltan === undefined || bloqueado) {
        host.innerText = "";
        return;
    }

    if (faltan === 0) host.innerText = "¡Tienes bingo! Pulsa el botón";
    else if (faltan === 1) host.innerText = "Te falta 1 casilla";
    else host.innerText = "Te faltan " + faltan + " casillas";

    host.classList.toggle("listo", faltan === 0);
});

socket.on("gameLocked", (locked) => {
    bloqueado = locked;
    aplicarBloqueo(locked);
});

socket.on("bingoRechazado", (datos) => {
    const faltan = datos && datos.faltan;
    aviso(
        faltan === 1
            ? "Todavía no: te falta 1 casilla del patrón"
            : "Todavía no: te faltan " + faltan + " casillas del patrón",
        "error"
    );
});

socket.on("winner", (ganador) => mostrarGanador(ganador, true));

socket.on("reset", () => {
    marcados = [];
    $("current").innerText = "";
    $("winner").hidden = true;
    renderUltimas();
    aviso("Partida reiniciada, cartón nuevo", "ok");
});

socket.on("salaCerrada", () => {
    aviso("La partida se ha cerrado", "error");
});

socket.on("connect", () => {
    estadoConexion(true);
    // Primera entrada y reconexiones pasan las dos por aquí, con el mismo id
    // de jugador, que es lo que devuelve el cartón y las marcas de siempre.
    if (miNombre) unirseAMesa();
});

socket.on("disconnect", () => {
    estadoConexion(false);
    aviso("Conexión perdida", "error");
});

/* ── Pintado ── */

function aplicarBloqueo(locked) {
    $("bingoBtn").disabled = locked;
    $("estadoPartida").hidden = !locked;
    $("carton").classList.toggle("bloqueado", locked);
    if (locked) $("progreso").innerText = "";
    actualizarCasillas();
}

function mostrarGanador(ganador, celebrar) {
    const soyYo = ganador.jugadorId && ganador.jugadorId === leerAlmacen(claveJugador);
    const panel = $("winner");

    panel.querySelector(".winner-title").innerText =
        soyYo ? "🎉 ¡Ganaste!" : "🏆 " + ganador.nombre + " cantó bingo";

    panel.querySelector(".winner-sub").innerText =
        soyYo
            ? "Tu cartón #" + ganador.cardId + " completó el patrón"
            : "Se llevó la partida con el cartón #" + ganador.cardId;

    panel.hidden = false;

    if (celebrar && soyYo) {
        lanzarConfeti();
        decir("¡Bingo! Has ganado");
    }
}

function cerrarGanador() {
    $("winner").hidden = true;
}

function mostrarNumero(num) {
    $("current").innerText = num;
}

function renderUltimas() {
    const ultimas = drawnNumbers.slice(-6).reverse();

    $("ultimas").innerHTML = ultimas
        .map((n, i) => `<span class="bola ${i === 0 ? "reciente" : ""}">${n}</span>`)
        .join("");
}

// Construye las 25 casillas una sola vez. A partir de ahí solo se actualizan
// sus clases: reconstruir la rejilla en cada clic perdía el foco del teclado.
function renderCard() {
    if (!card) return;

    const rejilla = $("rejilla");
    rejilla.innerHTML = "";

    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const valor = card.data[c][r];
            const esLibre = valor === "FREE";

            const celda = document.createElement("button");
            celda.type = "button";
            celda.className = "casilla";
            celda.textContent = esLibre ? "FREE" : valor;
            celda.setAttribute("aria-label",
                esLibre ? "Casilla libre" : String(valor));

            if (esLibre) {
                celda.classList.add("libre", "marcada");
                celda.disabled = true;
            } else {
                celda.dataset.valor = valor;
                celda.addEventListener("click", () => marcar(valor));
            }

            rejilla.appendChild(celda);
        }
    }

    actualizarCasillas();
}

function actualizarCasillas() {
    const ultima = drawnNumbers[drawnNumbers.length - 1];

    document.querySelectorAll("#rejilla .casilla[data-valor]").forEach(celda => {
        const valor = Number(celda.dataset.valor);
        const marcada = marcados.includes(valor);

        celda.classList.toggle("marcada", marcada);
        celda.classList.toggle("cantada", !marcada && valor === ultima);
        celda.setAttribute("aria-pressed", marcada ? "true" : "false");
        celda.disabled = bloqueado;
    });
}

function marcar(num) {
    if (bloqueado) return;

    if (!drawnNumbers.includes(num)) {
        aviso("El " + num + " todavía no ha salido", "error");
        return;
    }

    // Pintamos ya y avisamos al servidor, que es quien guarda la marca
    const i = marcados.indexOf(num);
    if (i === -1) marcados.push(num);
    else marcados.splice(i, 1);

    actualizarCasillas();
    socket.emit("marcar", num);
}

function checkBingo() {
    if (!card || bloqueado) return;
    socket.emit("checkBingo");
}
