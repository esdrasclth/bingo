<div align="center">

# Bingo PRO

### Bingo multijugador en tiempo real, simple de compartir y listo para jugar

### [🎉 Jugar ahora en bingo.brandsofts.com](https://bingo.brandsofts.com/)

Crea una partida, comparte el enlace y permite que cada participante juegue desde su teléfono mientras el anfitrión controla el sorteo y una pantalla común muestra el progreso.

![Portada de Bingo PRO](public/branding/og-cover.png)

</div>

## Características

- Salas multijugador independientes con códigos fáciles de compartir.
- Cartones únicos de 5 × 5 para cada participante.
- Actualizaciones en tiempo real mediante WebSockets.
- Panel protegido para el anfitrión.
- Regreso sencillo al panel usando el código de sala y el token de anfitrión.
- Vista de proyección con tablero, número actual y código QR.
- Persistencia opcional de partidas y jugadores mediante Neon Postgres.
- Recuperación del cartón y las marcas después de recargar la página.
- Diferentes patrones de victoria: cartón lleno, líneas, diagonales, cruz y cuadro central.
- Validación del bingo en el servidor.
- Interfaz adaptable para móviles, computadoras y pantallas compartidas.
- Metadatos Open Graph, Twitter Cards, favicons e iconos PWA.
- Contenedor Docker preparado para desplegarse en Dokploy.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Servidor | Node.js y Express |
| Tiempo real | Socket.IO |
| Persistencia | Neon Postgres, opcional |
| Interfaz | HTML, CSS y JavaScript sin framework |
| Códigos QR | QRCode |
| Despliegue | Docker y Dokploy |

## Requisitos

- Node.js 18 o superior.
- npm.
- Una base de datos Neon Postgres si se desea persistencia entre reinicios.

## Instalación local

```bash
git clone https://github.com/esdrasclth/bingo.git
cd bingo
npm install
npm start
```

Abre `http://localhost:3000` en el navegador.

La base de datos es opcional. Si `DATABASE_URL` no está configurada, la aplicación funciona completamente en memoria; las partidas activas se perderán al reiniciar el servidor.

## Variables de entorno

Crea un archivo `.env` o configura las variables directamente en el proveedor de despliegue. Puedes usar [.env.example](.env.example) como referencia.

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `DATABASE_URL` | No | Cadena de conexión de Neon Postgres para persistir partidas. |
| `PUBLIC_URL` | Recomendada en producción | URL pública sin barra final, por ejemplo `https://bingo.ejemplo.com`. Se utiliza en Open Graph y enlaces canónicos. |
| `PORT` | No | Puerto HTTP. El valor predeterminado es `3000`. |

Ejemplo:

```env
DATABASE_URL=postgresql://usuario:contraseña@host/base?sslmode=require
PUBLIC_URL=https://bingo.ejemplo.com
PORT=3000
```

No agregues archivos `.env`, `.env.local` o credenciales al repositorio.

## Uso

1. Abre [bingo.brandsofts.com](https://bingo.brandsofts.com/) y selecciona **Crear partida**.
2. Guarda el token de anfitrión mostrado por la aplicación.
3. Comparte el enlace para jugadores o el código de la sala.
4. Abre el enlace de proyección en una pantalla compartida, si lo necesitas.
5. Desde el panel del anfitrión, selecciona el patrón y comienza a sacar bolas.

### Volver al panel del anfitrión

Si cerraste el panel por accidente, vuelve a la página principal y busca **¿Cerraste el panel?**. Pega el token de anfitrión y selecciona **Volver a mi panel**; la aplicación encontrará la sala activa correspondiente sin pedirte el código.

También puedes abrir directamente `/admin/CÓDIGO` e introducir allí el token. El token nunca se agrega a la URL y se conserva únicamente en el almacenamiento temporal de la pestaña. La recuperación tiene límite de intentos y una sala que ya expiró o fue eliminada no puede reabrirse con el token.

## Rutas principales

| Ruta | Descripción |
| --- | --- |
| `/` | Página de inicio para crear una partida o unirse con un código. |
| `/jugar/:codigo` | Cartón del participante. |
| `/admin/:codigo` | Panel de control del anfitrión. |
| `/pantalla/:codigo` | Vista de proyección de la partida. |
| `/api/salud` | Estado del servicio para healthchecks y monitoreo. |

## Despliegue en Dokploy

1. Crea una aplicación nueva desde este repositorio de GitHub.
2. Selecciona el despliegue mediante `Dockerfile`.
3. Configura el puerto interno `3000`.
4. Agrega `DATABASE_URL` y `PUBLIC_URL` en las variables de entorno.
5. Asocia el dominio público y habilita HTTPS.
6. Despliega la aplicación.

El [Dockerfile](Dockerfile) instala únicamente las dependencias de producción, ejecuta el proceso con un usuario sin privilegios, utiliza `tini` para un apagado ordenado e incluye un healthcheck contra `/api/salud`.

### Escalamiento

Bingo PRO mantiene el estado activo de las salas en memoria y utiliza conexiones WebSocket. Debe ejecutarse con **una sola réplica**. Para utilizar varias réplicas se necesitaría un adaptador compartido para Socket.IO y coordinación distribuida del estado de las partidas.

## Estructura del proyecto

```text
.
├── branding/          # Fuentes gráficas y generador de recursos de marca
├── public/            # CSS, JavaScript, manifest e imágenes públicas
├── views/             # Vistas de jugador, anfitrión y proyección
├── db.js              # Persistencia opcional en Neon
├── server.js          # Servidor HTTP, API, salas y eventos Socket.IO
├── Dockerfile         # Imagen de producción
└── package.json
```

## Seguridad y operación

- Los tokens de anfitrión se almacenan mediante hash SHA-256 y se comparan en tiempo constante.
- La validación de cartones, marcas y victorias ocurre en el servidor.
- La creación de partidas tiene límites por dirección IP.
- Las salas inactivas se eliminan automáticamente.
- Las credenciales locales están excluidas mediante `.gitignore` y `.dockerignore`.

## Licencia

Este proyecto se distribuye bajo la licencia ISC indicada en `package.json`.
