/* Analítica con Umami (autoalojado en analytics.brandsofts.com).
 *
 * Se carga antes que el script de Umami en todas las páginas:
 *  - normalizarVisita: Umami la llama antes de enviar cada dato (atributo
 *    data-before-send). Cambia /jugar/ABC123 por /jugar/:sala para que las
 *    estadísticas no se partan en una página distinta por cada sala.
 *  - registrar: envía un evento del juego (partida creada, jugador unido,
 *    bingo ganado). Si Umami no cargó (bloqueador, sin conexión) no hace nada.
 */

(function () {
    const SALA = /\/(jugar|admin|pantalla)\/[^/?#]+/;

    function limpiar(url) {
        return typeof url === "string" ? url.replace(SALA, "/$1/:sala") : url;
    }

    window.normalizarVisita = function (tipo, datos) {
        datos.url = limpiar(datos.url);
        datos.referrer = limpiar(datos.referrer);
        return datos;
    };

    window.registrar = function (nombre, datos) {
        try {
            if (window.umami) window.umami.track(nombre, datos);
        } catch (e) {
            // La analítica nunca debe romper el juego.
        }
    };
})();
