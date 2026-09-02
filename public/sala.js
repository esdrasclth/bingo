// Piezas que comparten las tres páginas de sala: jugador, admin y pantalla.

const CODIGO_SALA = decodeURIComponent(
    location.pathname.split("/").filter(Boolean)[1] || ""
).toUpperCase();

const ETIQUETAS = {
    FULL: "Cartón lleno",
    HORIZONTAL: "Línea horizontal",
    VERTICAL: "Línea vertical",
    X: "Diagonal X",
    CROSS: "Cruz",
    CENTER_BOX: "Cuadrado central"
};

// Casillas que forman cada patrón, para dibujar la miniatura 5x5
const FORMAS = {
    FULL:       () => true,
    HORIZONTAL: i => Math.floor(i / 5) === 2,
    VERTICAL:   i => i % 5 === 2,
    X:          i => { const r = Math.floor(i / 5), c = i % 5; return r === c || r + c === 4; },
    CROSS:      i => { const r = Math.floor(i / 5), c = i % 5; return r === 2 || c === 2; },
    CENTER_BOX: i => { const r = Math.floor(i / 5), c = i % 5; return r > 0 && r < 4 && c > 0 && c < 4; }
};

const etiquetaPatron = p => ETIQUETAS[p] || p;

function pintarMiniPatron(host, patron) {
    if (!host) return;

    const test = FORMAS[patron] || (() => false);

    host.innerHTML = "";
    for (let i = 0; i < 25; i++) {
        const celda = document.createElement("i");
        if (test(i)) celda.className = "on";
        host.appendChild(celda);
    }
}

function estadoConexion(ok) {
    const punto = document.getElementById("puntoConexion");
    const texto = document.getElementById("textoConexion");

    if (punto) punto.classList.toggle("caido", !ok);
    if (texto) texto.innerText = ok ? "En línea" : "Sin conexión";
}

// Aviso no bloqueante, en lugar de alert()
function aviso(mensaje, tipo = "info") {
    const cont = document.getElementById("avisos");
    if (!cont) return;

    const el = document.createElement("div");
    el.className = "toast " + tipo;
    el.innerText = mensaje;

    cont.appendChild(el);

    setTimeout(() => {
        el.classList.add("saliendo");
        setTimeout(() => el.remove(), 300);
    }, 2600);
}

function salaNoEncontrada() {
    const fallo = document.getElementById("sinSala");
    const app = document.getElementById("app");

    const eco = document.getElementById("codigoFallido");
    if (eco) eco.innerText = CODIGO_SALA || "(vacío)";

    if (app) app.hidden = true;
    if (fallo) fallo.hidden = false;
}

/* ── Identidad persistente del jugador ──
   Guardada por sala, para que recargar devuelva el mismo cartón. */

const claveJugador = "bingo:jugador:" + CODIGO_SALA;
const claveNombre  = "bingo:nombre";

function leerAlmacen(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return null; }
}

function guardarAlmacen(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* modo privado */ }
}

/* ── Voz: canta el número ── */

const claveVoz = "bingo:voz";
let vozActiva = leerAlmacen(claveVoz) === "1";

function hayVoz() {
    return typeof speechSynthesis !== "undefined";
}

function alternarVoz(boton) {
    vozActiva = !vozActiva;
    guardarAlmacen(claveVoz, vozActiva ? "1" : "0");
    pintarBotonVoz(boton);

    // Hablar dentro del clic satisface el gesto que exigen los navegadores
    if (vozActiva) decir("Voz activada");
}

function pintarBotonVoz(boton) {
    if (!boton) return;
    boton.innerText = vozActiva ? "🔊 Voz activada" : "🔇 Voz apagada";
    boton.setAttribute("aria-pressed", vozActiva ? "true" : "false");
    boton.classList.toggle("secundario", !vozActiva);
}

function decir(texto) {
    if (!vozActiva || !hayVoz()) return;

    const frase = new SpeechSynthesisUtterance(texto);
    frase.lang = "es-ES";
    frase.rate = 0.95;

    speechSynthesis.cancel();
    speechSynthesis.speak(frase);
}

function cantarNumero(num) {
    // Solo el número: añadir la letra de la columna confundía al cantar
    decir(String(num));
}

/* ── Confeti ── */

function lanzarConfeti(duracionMs = 3500) {
    const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducido) return;

    const lienzo = document.createElement("canvas");
    lienzo.className = "confeti";
    document.body.appendChild(lienzo);

    const ctx = lienzo.getContext("2d");
    const dpr = Math.min(devicePixelRatio || 1, 2);

    function dimensionar() {
        lienzo.width = innerWidth * dpr;
        lienzo.height = innerHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    dimensionar();
    addEventListener("resize", dimensionar);

    const colores = ["#008253", "#FF751F", "#FFB3F7", "#F9BD7E", "#00A1D4", "#F1A454"];
    const trozos = [];

    for (let i = 0; i < 160; i++) {
        trozos.push({
            x: Math.random() * innerWidth,
            y: -20 - Math.random() * innerHeight * 0.6,
            ancho: 6 + Math.random() * 8,
            alto: 8 + Math.random() * 10,
            color: colores[Math.floor(Math.random() * colores.length)],
            vy: 1.6 + Math.random() * 2.6,
            vx: -1 + Math.random() * 2,
            giro: Math.random() * Math.PI,
            vgiro: -0.12 + Math.random() * 0.24
        });
    }

    const fin = performance.now() + duracionMs;

    function cuadro(ahora) {
        ctx.clearRect(0, 0, innerWidth, innerHeight);

        for (const t of trozos) {
            t.y += t.vy;
            t.x += t.vx;
            t.giro += t.vgiro;

            if (t.y > innerHeight + 20) {
                t.y = -20;
                t.x = Math.random() * innerWidth;
            }

            ctx.save();
            ctx.translate(t.x, t.y);
            ctx.rotate(t.giro);
            ctx.fillStyle = t.color;
            ctx.fillRect(-t.ancho / 2, -t.alto / 2, t.ancho, t.alto);
            ctx.restore();
        }

        if (ahora < fin) {
            requestAnimationFrame(cuadro);
        } else {
            removeEventListener("resize", dimensionar);
            lienzo.remove();
        }
    }

    requestAnimationFrame(cuadro);
}

/* ── Entrada a la sala ── */

function unirseASala(socket, rol, alEntrar) {
    const carga = { codigo: CODIGO_SALA, rol };

    if (rol === "jugador") {
        carga.jugadorId = leerAlmacen(claveJugador) || undefined;
        carga.nombre = leerAlmacen(claveNombre) || undefined;
    }

    socket.emit("unirse", carga, (respuesta) => {
        if (!respuesta || !respuesta.ok) {
            salaNoEncontrada();
            return;
        }

        if (respuesta.jugadorId) guardarAlmacen(claveJugador, respuesta.jugadorId);

        const eco = document.getElementById("codigoSala");
        if (eco) eco.innerText = respuesta.codigo;

        const app = document.getElementById("app");
        if (app) app.hidden = false;

        if (typeof alEntrar === "function") alEntrar(respuesta);
    });
}
