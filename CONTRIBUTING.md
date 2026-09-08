# Cómo contribuir

Gracias por el interés en Bingo PRO. Este documento explica cómo proponer un cambio y qué se espera de él.

## Antes de escribir código

- Para un fallo, abre un *issue* con los pasos exactos para reproducirlo, qué esperabas y qué ocurrió. Indica navegador y si el problema aparece como jugador, anfitrión o en la vista de proyección.
- Para una función nueva, abre primero un *issue* describiendo el caso de uso. Es más rápido acordar el enfoque antes que rehacer un pull request completo.
- Si el cambio es de una línea o corrige una errata, ve directo al pull request.

## Entorno de desarrollo

```bash
git clone https://github.com/esdrasclth/bingo.git
cd bingo
npm install
npm start
```

La aplicación queda en `http://localhost:3000`. La base de datos es opcional: sin `DATABASE_URL` todo funciona en memoria, que es lo más cómodo para desarrollar. Consulta [.env.example](.env.example) para el resto de variables.

Para probar una partida completa conviene abrir tres ventanas: `/` para crear la sala, el enlace de jugador en una ventana privada y `/pantalla/CÓDIGO` en otra.

## Reglas del proyecto

Son las que sostienen el diseño actual; un cambio que las rompa necesita justificación en el issue.

- **El servidor es la autoridad.** Cartones, marcas, patrones y victorias se validan en `server.js`. El cliente pinta lo que el servidor le dice; nunca decide quién gana.
- **El estado vive dentro de `Partida`,** no en variables de módulo, para que un mismo proceso sostenga muchas salas sin que se pisen.
- **Nada de estado duplicado.** Si un dato se puede derivar de otro, se deriva. `gameLocked`, por ejemplo, es un *getter* sobre el podio.
- **Los nombres los escriben los jugadores:** cualquier texto de usuario que llegue al DOM pasa por `escapar()` o por `textContent`.
- **Una réplica.** Las salas viven en memoria y las conexiones son WebSocket; el proyecto no asume un adaptador compartido de Socket.IO.
- **Sin dependencias nuevas** salvo que resuelvan algo que no es razonable escribir a mano. La interfaz no usa framework y así se queda.

## Estilo

- Español en comentarios, nombres de funciones, variables y textos de interfaz, igual que el código existente.
- Cuatro espacios de indentación, comillas dobles en JavaScript, punto y coma.
- Comenta el *porqué*, no el *qué*. Los comentarios útiles del proyecto explican la razón de una decisión, no repiten la línea siguiente.
- Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/es/): `fix:`, `feat:`, `docs:`, `refactor:`…

## Pruebas

El proyecto no tiene todavía una suite automatizada. Antes de abrir el pull request, comprueba a mano y describe en la descripción qué probaste:

- Crear sala, unirse con dos jugadores y cantar bolas.
- El patrón que tocaste, si tocaste alguno, incluido el caso de ganar y el de que falte una casilla.
- Recargar la página del jugador: debe volver el mismo cartón con sus marcas.
- Recuperar el panel del anfitrión con el token.

Si añades lógica de juego en el servidor, incluye en el pull request la forma de reproducir el caso.

## Pull requests

1. Crea una rama descriptiva: `fix/diagonal-x`, `feat/podio`.
2. Un pull request, un tema. Si el cambio arrastra un *refactor*, sepáralo.
3. En la descripción: qué problema resuelve, qué decisión de diseño tomaste y cómo lo probaste.
4. No incluyas `node_modules`, archivos `.env` ni credenciales.

## Seguridad

Si encuentras una vulnerabilidad, no abras un issue público: escribe a <Esdras.Clother@outlook.com> con los detalles para reproducirla.
