// Portada: crear una partida nueva o entrar a una existente por código.

const $ = id => document.getElementById(id);

function abrirAyuda() { $("ayuda").showModal(); }
function cerrarAyuda() { $("ayuda").close(); }

// Clic fuera de la caja: <dialog> no lo cierra solo, y el backdrop cuenta como
// clic sobre el propio diálogo, así que se compara con su rectángulo.
$("ayuda").addEventListener("click", (e) => {
    const caja = e.currentTarget.getBoundingClientRect();

    const dentro = e.clientX >= caja.left && e.clientX <= caja.right &&
                   e.clientY >= caja.top  && e.clientY <= caja.bottom;

    if (!dentro) cerrarAyuda();
});

function ganadoresElegidos() {
    const marcado = document.querySelector("input[name='maxGanadores']:checked");
    const n = Number(marcado && marcado.value);
    return n >= 1 && n <= 3 ? n : 1;
}

async function crearPartida() {
    const boton = $("crearBtn");
    boton.disabled = true;

    try {
        const res = await fetch("/api/partidas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ maxGanadores: ganadoresElegidos() })
        });
        const datos = await res.json();

        if (!res.ok) {
            aviso(datos.error || "No se pudo crear la partida", "error");
            boton.disabled = false;
            return;
        }

        // El cupo lo confirma el servidor, que es quien lo valida
        mostrarCreada(datos.codigo, datos.tokenAdmin, datos.maxGanadores);

    } catch (e) {
        aviso("No hay conexión con el servidor", "error");
        boton.disabled = false;
    }
}

function mostrarCreada(codigo, tokenAdmin, maxGanadores) {
    const base = location.origin;

    $("codigoCreado").innerText = codigo;

    $("resumenGanadores").innerText = maxGanadores > 1
        ? "🏆 Partida a " + maxGanadores + " ganadores"
        : "🏆 Partida a 1 ganador";
    $("urlJugar").innerText = base + "/jugar/" + codigo;
    $("urlPantalla").innerText = base + "/pantalla/" + codigo;
    $("tokenAdmin").innerText = tokenAdmin;

    // El token viaja al panel por sessionStorage, no por la URL: así no queda
    // en el historial ni se filtra por la cabecera Referer.
    try {
        sessionStorage.setItem("bingo:token:" + codigo, tokenAdmin);
    } catch (e) {
        // Modo privado sin almacenamiento: el panel pedirá el token a mano
    }

    $("irPanel").onclick = () => { location.href = "/admin/" + codigo; };

    $("inicio").hidden = true;
    $("creada").hidden = false;
}

$("unirseForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const campo = $("codigo");
    const codigo = campo.value.trim().toUpperCase();
    const boton = e.target.querySelector("button");

    if (!codigo) return;

    boton.disabled = true;

    try {
        const res = await fetch("/api/partidas/" + encodeURIComponent(codigo));

        if (!res.ok) {
            aviso("No existe ninguna partida con ese código", "error");
            campo.focus();
            campo.select();
            boton.disabled = false;
            return;
        }

        const datos = await res.json();
        location.href = "/jugar/" + datos.codigo;

    } catch (err) {
        aviso("No hay conexión con el servidor", "error");
        boton.disabled = false;
    }
});

$("recuperarAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const campoToken = $("tokenAdminGuardado");
    const token = campoToken.value.trim();
    const boton = e.target.querySelector("button");

    if (!token) return;

    boton.disabled = true;

    try {
        const res = await fetch("/api/admin/recuperar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });
        const datos = await res.json();

        if (!res.ok) {
            aviso(datos.error || "No fue posible recuperar la partida", "error");
            campoToken.focus();
            campoToken.select();
            boton.disabled = false;
            return;
        }

        // El panel validará el token con el servidor. Se mantiene en esta
        // pestaña y nunca se expone en la URL, el historial o los enlaces.
        try {
            sessionStorage.setItem("bingo:token:" + datos.codigo, token);
        } catch (err) {
            aviso("Tu navegador no permite guardar el token. Introdúcelo directamente en el panel.", "error");
        }

        location.href = "/admin/" + datos.codigo;

    } catch (err) {
        aviso("No hay conexión con el servidor", "error");
        boton.disabled = false;
    }
});

// Mayúsculas mientras se escribe, para que coincida con el código impreso
$("codigo").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
});

async function copiar(id, boton) {
    const texto = $(id).innerText;
    const original = boton.innerText;

    try {
        await navigator.clipboard.writeText(texto);
        boton.innerText = "¡Copiado!";
    } catch (e) {
        // Sin permiso de portapapeles: al menos lo dejamos seleccionado
        const rango = document.createRange();
        rango.selectNodeContents($(id));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(rango);
        boton.innerText = "Copia con Ctrl+C";
    }

    setTimeout(() => { boton.innerText = original; }, 1800);
}

// Aviso no bloqueante
function aviso(mensaje, tipo = "info") {
    const cont = $("avisos");

    const el = document.createElement("div");
    el.className = "toast " + tipo;
    el.innerText = mensaje;

    cont.appendChild(el);

    setTimeout(() => {
        el.classList.add("saliendo");
        setTimeout(() => el.remove(), 300);
    }, 2600);
}
