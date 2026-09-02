// Vista de proyección: solo muestra, no controla nada.

const socket = io();
const $ = id => document.getElementById(id);

let salidas = [];

// La entrada ocurre en el manejador de "connect", nunca antes
function entrarComoPantalla() {
    unirseASala(socket, "pantalla", () => {
        pintarBotonVoz($("vozBtn"));
        cargarQR();
    });
}

async function cargarQR() {
    $("codigoQr").innerText = CODIGO_SALA;

    try {
        const res = await fetch("/api/qr/" + encodeURIComponent(CODIGO_SALA));
        if (!res.ok) return;

        const datos = await res.json();
        $("qr").innerHTML = datos.svg;
        $("urlJugar").innerText = datos.url.replace(/^https?:\/\//, "");
    } catch (e) {
        $("qr").innerHTML = "<p class='apunte'>No se pudo generar el QR</p>";
    }
}

socket.on("estado", (estado) => {
    salidas = estado.drawn.slice();

    $("players").innerText = estado.jugadores;
    $("status").innerText = etiquetaPatron(estado.pattern);
    pintarMiniPatron($("miniPatron"), estado.pattern);

    pintarTablero();

    if (estado.ganador) mostrarGanador(estado.ganador, false);
    else $("winner").hidden = true;
});

socket.on("pattern", (p) => {
    $("status").innerText = etiquetaPatron(p);
    pintarMiniPatron($("miniPatron"), p);
});

socket.on("currentNumber", (num) => {
    salidas.push(num);
    pintarTablero();
    cantarNumero(num);
});

socket.on("players", (datos) => {
    $("players").innerText = datos.total;
});

socket.on("winner", (ganador) => mostrarGanador(ganador, true));

socket.on("reset", () => {
    salidas = [];
    pintarTablero();
    $("winner").hidden = true;
});

socket.on("salaCerrada", () => aviso("La partida se ha cerrado", "error"));

socket.on("connect", () => {
    estadoConexion(true);
    entrarComoPantalla();
});

socket.on("disconnect", () => estadoConexion(false));

function pintarTablero() {
    const ultima = salidas[salidas.length - 1];

    $("current").innerText = ultima ? ultima : "";
    $("contador").innerText = salidas.length;

    // Últimas seis, la más reciente primero
    $("ultimas").innerHTML = salidas.slice(-7, -1).reverse()
        .map(n => `<span class="bola">${n}</span>`)
        .join("");

    // Tablero completo 1-75: las que ya salieron quedan encendidas
    const celdas = [];
    for (let n = 1; n <= 75; n++) {
        const salio = salidas.includes(n);
        const clases = "bola" + (salio ? " salida" : " pendiente") + (n === ultima ? " reciente" : "");
        celdas.push(`<span class="${clases}">${n}</span>`);
    }
    $("numbers").innerHTML = celdas.join("");
}

function mostrarGanador(ganador, celebrar) {
    $("ganadorNombre").innerText = "¡" + ganador.nombre + "!";
    $("ganadorSub").innerText = "Ganó con el cartón #" + ganador.cardId;
    $("winner").hidden = false;

    if (celebrar) {
        lanzarConfeti(6000);
        decir("¡Bingo! Ganó " + ganador.nombre);
    }
}
