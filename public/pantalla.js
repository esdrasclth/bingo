// Vista de proyección: solo muestra, no controla nada.

const socket = io();
const $ = id => document.getElementById(id);

let salidas = [];
let ganadores = [];
let maxGanadores = 1;
let terminada = false;
let temporizadorCelebracion = null;

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

    ganadores = estado.ganadores || [];
    maxGanadores = estado.maxGanadores || 1;
    terminada = estado.gameLocked;

    pintarCupo();
    pintarTablero();

    if (ganadores.length) mostrarPodio(null, false);
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

socket.on("winner", (datos) => {
    ganadores = datos.ganadores || [];
    maxGanadores = datos.maxGanadores || 1;
    terminada = !!datos.terminada;

    pintarCupo();
    mostrarPodio(datos.ganador, true);
});

socket.on("reset", () => {
    salidas = [];
    ganadores = [];
    terminada = false;
    pintarCupo();
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

function pintarCupo() {
    $("cupoGanadores").innerText = maxGanadores > 1
        ? "Ganadores " + ganadores.length + " de " + maxGanadores
        : "";
}

// La celebración muestra a quien acaba de cantar y, si la sala reparte varios
// premios, el podio completo debajo. `ganador` es null al reconstruir estado.
function mostrarPodio(ganador, celebrar) {
    const ultimo = ganador || ganadores[ganadores.length - 1];
    if (!ultimo) return;

    const restan = maxGanadores - ganadores.length;

    $("celebracionTitulo").innerText = maxGanadores > 1
        ? medalla(ultimo.puesto) + " " + textoPuesto(ultimo.puesto)
        : "Tenemos bingo";

    $("ganadorNombre").innerText = "¡" + ultimo.nombre + "!";

    $("ganadorSub").innerText = restan > 0
        ? "Cartón #" + ultimo.cardId + " · " +
          (restan === 1 ? "queda 1 puesto" : "quedan " + restan + " puestos")
        : "Ganó con el cartón #" + ultimo.cardId;

    pintarPodio($("podio"), ganadores, maxGanadores);
    $("winner").hidden = false;

    // Con puestos libres la partida sigue: la celebración se retira sola para
    // no tapar el tablero proyectado.
    clearTimeout(temporizadorCelebracion);
    if (!terminada) {
        temporizadorCelebracion = setTimeout(() => { $("winner").hidden = true; }, 8000);
    }

    if (celebrar) {
        lanzarConfeti(6000);
        decir(maxGanadores > 1
            ? "¡Bingo! " + ultimo.nombre + " se lleva el " + textoPuesto(ultimo.puesto)
            : "¡Bingo! Ganó " + ultimo.nombre);
    }
}
