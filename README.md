# MKT

Programa en entorno web para monitorizar dispositivos Mikrotik. Incluye un login sencillo y un dashboard de ejemplo.

## Instalación

```bash
npm install
```

## Uso

```bash
node backend/index.js
```

Se crea una base de datos SQLite en `backend/db.sqlite` con el usuario por defecto `admin`/`admin`. Inicia la aplicación y accede a `http://localhost:3000/login` para iniciar sesión y ver el dashboard.

Desde el menú **Ajustes** es posible cambiar el puerto donde el servicio de escucha recibe los `ping` de los dispositivos Mikrotik. Al guardar un nuevo puerto el servicio se reinicia automáticamente.

## Script de Mikrotik

En el directorio `scripts` se incluye el archivo `heartbeat.rsc` que se debe cargar en cada Mikrotik. Sustituye `YOUR_TOKEN` por el token que aparece al editar el dispositivo en la web y actualiza la URL con la IP o dominio de tu servidor.
