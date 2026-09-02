const socket = io();
const $ = id => document.getElementById(id);

let salidas = [];
let autenticado = false;
let currentPattern = "FULL";

// El servidor marca isAdmin en el socket. Al reconectar llega un socket nuevo
// sin esa marca, así que guardamos el token para volver a presentarlo.
let tokenAdmin = null;

const claveToken = "bingo:token:" + CODIGO_SALA;

/* ── Entrada ── */

// La entrada ocurre en el manejador de "connect", nunca antes
function entrarComoAdmin() {
    unirseASala(socket, "admin", () => {
        pintarEnlaces();
        cargarQR();

        // El token guardado puede venir de la portada o de una sesión anterior
        let guardado = tokenAdmin;
        if (!guardado) {
            try { guardado = sessionStorage.getItem(claveToken); } catch (e) { /* modo privado */ }
        }

        if (guardado) autenticar(guardado, true);
        else abrirPuerta();
    });
}

function abrirPuerta() {
    $("codigoPuerta").innerText = CODIGO_SALA;
    $("app").hidden = true;
    $("puerta").hidden = false;
    $("token").focus();
}

$("authForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const input = $("token");
    const boton = e.target.querySelector("button");

    boton.disabled = true;

    autenticar(input.value, false, () => { boton.disabled = false; });
});

function autenticar(token, silencioso, alTerminar) {
    socket.emit("adminAuth", token, (ok) => {
        if (typeof alTerminar === "function") alTerminar();

        if (!ok) {
            const input = $("token");
            input.value = "";
            input.focus();
            if (!silencioso) aviso("Token incorrecto", "error");
            abrirPuerta();
            return;
        }

        tokenAdmin = token;
        autenticado = true;

        try { sessionStorage.setItem(claveToken, token); } catch (e) { /* modo privado */ }

        $("puerta").hidden = true;
        $("app").hidden = false;
        pintarBotonVoz($("vozBtn"));

        if (!silencioso) aviso("Sesión de anfitrión iniciada", "ok");
    });
}

function cerrarSesion(mensaje) {
    tokenAdmin = null;
    autenticado = false;
    try { sessionStorage.removeItem(claveToken); } catch (e) { /* modo privado */ }
    abrirPuerta();
    aviso(mensaje, "error");
}

/* ── Acciones ── */

function draw()  { socket.emit("draw"); }
function reset() { socket.emit("reset"); }

function setPattern() {
    socket.emit("setPattern", $("patternSelect").value);
}

/* ── Estado ── */

socket.on("estado", (estado) => {
    salidas = estado.drawn.slice();
    currentPattern = estado.pattern;

    $("patternSelect").value = estado.pattern;
    $("currentPattern").innerText = etiquetaPatron(estado.pattern);
    pintarMiniPatron($("miniPatron"), estado.pattern);

    aplicarBloqueo(estado.gameLocked);
    pintarSalidas();
    pintarJugadores(estado.lista, estado.jugadores);

    $("winner").innerText = estado.ganador
        ? "🏆 Ganó " + estado.ganador.nombre + " (cartón #" + estado.ganador.cardId + ")"
        : "";
});

socket.on("pattern", (p) => {
    currentPattern = p;
    $("patternSelect").value = p;
    $("currentPattern").innerText = etiquetaPatron(p);
    pintarMiniPatron($("miniPatron"), p);
});

socket.on("currentNumber", (num) => {
    salidas.push(num);
    pintarSalidas();
    cantarNumero(num);
});

socket.on("players", (datos) => {
    pintarJugadores(datos.lista, datos.total);
});

socket.on("gameLocked", (locked) => aplicarBloqueo(locked));

socket.on("winner", (ganador) => {
    $("winner").innerText = "🏆 Ganó " + ganador.nombre + " (cartón #" + ganador.cardId + ")";
});

socket.on("reset", () => {
    salidas = [];
    pintarSalidas();
    $("winner").innerText = "";
    if (autenticado) aviso("Partida reiniciada, cartones nuevos", "ok");
});

socket.on("salaCerrada", () => aviso("La partida se ha cerrado", "error"));

// Acción rechazada: el servidor ya no nos reconoce como anfitrión
socket.on("noAutorizado", () => {
    if (autenticado) cerrarSesion("Sesión caducada, vuelve a entrar");
});

socket.on("connect", () => {
    estadoConexion(true);
    entrarComoAdmin();
});

socket.on("disconnect", () => {
    estadoConexion(false);
    aviso("Conexión perdida", "error");
});

/* ── Pintado ── */

function aplicarBloqueo(locked) {
    $("drawBtn").disabled = locked;
    $("patternSelect").disabled = locked;
    $("estadoPartida").hidden = !locked;
}

function pintarSalidas() {
    const ultima = salidas[salidas.length - 1];

    $("numbers").innerHTML = salidas
        .map(n => `<span class="bola ${n === ultima ? "reciente" : ""}">${n}</span>`)
        .join("");

    $("contador").innerText = salidas.length;
    $("current").innerText = ultima ? ultima : "";
}

function pintarJugadores(lista, total) {
    $("players").innerText = total;
    $("contadorJugadores").innerText = total;

    const host = $("listaJugadores");

    if (!lista || !lista.length) {
        host.innerHTML = "<li class='apunte'>Todavía no se ha unido nadie.</li>";
        return;
    }

    host.innerHTML = lista
        .map(j => `<li><span class="quien">${escapar(j.nombre)}</span><span class="bola chica">#${j.carton}</span></li>`)
        .join("");
}

// Los nombres los escriben los jugadores: nunca van al DOM sin escapar
function escapar(texto) {
    const d = document.createElement("div");
    d.textContent = texto;
    return d.innerHTML;
}

function pintarEnlaces() {
    const base = location.origin;

    $("codigoGrande").innerText = CODIGO_SALA;
    $("urlJugar").innerText = base + "/jugar/" + CODIGO_SALA;
    $("urlPantalla").innerText = base + "/pantalla/" + CODIGO_SALA;
}

async function cargarQR() {
    try {
        const res = await fetch("/api/qr/" + encodeURIComponent(CODIGO_SALA));
        if (!res.ok) return;

        const datos = await res.json();
        $("qr").innerHTML = datos.svg;
    } catch (e) { /* el QR es un extra, no bloquea el panel */ }
}

async function copiar(id, boton) {
    const texto = $(id).innerText;
    const original = boton.innerText;

    try {
        await navigator.clipboard.writeText(texto);
        boton.innerText = "¡Copiado!";
    } catch (e) {
        boton.innerText = "Copia con Ctrl+C";
    }

    setTimeout(() => { boton.innerText = original; }, 1800);
}
