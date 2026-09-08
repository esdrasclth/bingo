const socket = io();

let card = null;
let drawnNumbers = [];
let marcados = [];
let currentPattern = "FULL";
let terminada = false;
let miNombre = "";

// Podio de la sala: cuántos premios reparte y quién los lleva
let ganadores = [];
let maxGanadores = 1;

// bloqueado = no puedo tocar el cartón, sea porque la partida acabó o porque
// yo ya cobré mi premio y el resto sigue jugando por los que quedan.
let bloqueado = false;

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

    terminada = estado.gameLocked;
    ganadores = estado.ganadores || [];
    maxGanadores = estado.maxGanadores || 1;

    if (drawnNumbers.length) mostrarNumero(drawnNumbers[drawnNumbers.length - 1]);
    else $("current").innerText = "";

    $("status").innerText = etiquetaPatron(currentPattern);
    pintarMiniPatron($("miniPatron"), currentPattern);

    refrescarBloqueo();
    renderUltimas();
    actualizarCasillas();

    // Al recargar solo recuperamos el panel si la partida ya acabó o si yo
    // soy uno de los ganadores; si no, tapa el cartón de quien sigue jugando.
    if (ganadores.length && (terminada || miPuesto() !== null)) mostrarPodio(null, false);
    else $("winner").hidden = true;
});

socket.on("pattern", (p) => {
    currentPattern = p;
    $("status").innerText = etiquetaPatron(p);
    pintarMiniPatron($("miniPatron"), p);
});

// El anfitrión puede ajustar el cupo mientras no haya empezado el sorteo
socket.on("cupo", (datos) => {
    maxGanadores = datos.maxGanadores;
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
    terminada = locked;
    refrescarBloqueo();
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

socket.on("winner", (datos) => {
    ganadores = datos.ganadores || [];
    maxGanadores = datos.maxGanadores || 1;
    terminada = !!datos.terminada;

    refrescarBloqueo();

    const ganador = datos.ganador;
    const soyYo = ganador && ganador.jugadorId === leerAlmacen(claveJugador);

    // Mientras queden puestos, el bingo ajeno se avisa sin tapar el cartón
    if (terminada || soyYo) {
        mostrarPodio(ganador, true);
    } else {
        aviso(
            medalla(ganador.puesto) + " " + ganador.nombre + " se llevó el " +
            textoPuesto(ganador.puesto) + " · sigue jugando",
            "ok"
        );
    }
});

socket.on("bingoRepetido", () => {
    aviso("Ya tienes tu premio: deja que los demás peleen por los que faltan", "info");
});

socket.on("reset", () => {
    marcados = [];
    ganadores = [];
    terminada = false;
    refrescarBloqueo();
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

// Mi puesto en el podio, o null si todavía no he ganado
function miPuesto() {
    const yo = leerAlmacen(claveJugador);
    const mio = ganadores.find(g => g.jugadorId && g.jugadorId === yo);
    return mio ? mio.puesto : null;
}

function refrescarBloqueo() {
    aplicarBloqueo(terminada || miPuesto() !== null);
}

function aplicarBloqueo(locked) {
    bloqueado = locked;

    $("bingoBtn").disabled = locked;
    $("carton").classList.toggle("bloqueado", locked);
    if (locked) $("progreso").innerText = "";

    const estado = $("estadoPartida");
    const puesto = miPuesto();

    if (terminada) {
        estado.innerText = maxGanadores > 1
            ? "Podio completo · reinicia para jugar otra"
            : "Partida terminada";
    } else if (puesto !== null) {
        estado.innerText = medalla(puesto) + " Ya ganaste el " + textoPuesto(puesto) +
            " · siguen jugando por " + (maxGanadores - ganadores.length === 1
                ? "1 puesto" : (maxGanadores - ganadores.length) + " puestos");
    }

    estado.hidden = !locked;
    actualizarCasillas();
}

// Un solo panel sirve para "acabas de ganar", "ganó otro" y "así quedó el
// podio". `ganador` es el que acaba de cantar, o null al reconstruir estado.
function mostrarPodio(ganador, celebrar) {
    const yo = leerAlmacen(claveJugador);

    // Al reconstruir estado no llega ningún ganador concreto: si yo estoy en el
    // podio, el destacado soy yo; si no, se resume el marcador.
    const destacado = ganador ||
        ganadores.find(g => g.jugadorId && g.jugadorId === yo) || null;

    const soyYo = !!destacado && destacado.jugadorId && destacado.jugadorId === yo;
    const panel = $("winner");
    const restan = maxGanadores - ganadores.length;

    let titulo;
    if (soyYo) titulo = maxGanadores > 1
        ? medalla(destacado.puesto) + " ¡" + textoPuesto(destacado.puesto) + "!"
        : "🎉 ¡Ganaste!";
    else if (destacado) titulo = medalla(destacado.puesto) + " " + destacado.nombre + " cantó bingo";
    else titulo = "🏆 Partida terminada";

    let sub;
    if (soyYo) {
        sub = "Tu cartón #" + destacado.cardId + " completó el patrón";
    } else if (destacado) {
        sub = "Se lleva el " + textoPuesto(destacado.puesto) + " con el cartón #" + destacado.cardId;
    } else {
        sub = "Ganadores " + ganadores.length + " de " + maxGanadores;
    }

    if (!terminada && restan > 0) {
        sub += restan === 1
            ? " · queda 1 puesto por ganar"
            : " · quedan " + restan + " puestos por ganar";
    }

    panel.querySelector(".winner-title").innerText = titulo;
    panel.querySelector(".winner-sub").innerText = sub;
    pintarPodio($("winnerPodio"), ganadores, maxGanadores);

    panel.hidden = false;

    if (celebrar && soyYo) {
        lanzarConfeti();
        decir(maxGanadores > 1
            ? "¡Bingo! Has ganado el " + textoPuesto(destacado.puesto)
            : "¡Bingo! Has ganado");
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
