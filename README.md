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

### HTTPS para los `ping`

El servicio que recibe los `ping` ahora funciona sobre HTTPS. Debes colocar tus certificados en `backend/ssl/cert.pem` y `backend/ssl/key.pem` (o definir las rutas con las variables de entorno `SSL_CERT` y `SSL_KEY`).

Cada dispositivo debe enviar su token junto con el nombre de nube (`cloud`). Puedes ver o editar el token desde el formulario de cada Mikrotik.

Ejemplo de llamada desde el dispositivo:

```
/tool fetch url="https://TU_SERVIDOR:PUERTO/ping?cloud=example&token=TOKEN" keep-result=no
```

Desde el menú **Ajustes** es posible cambiar el puerto donde el servicio de escucha recibe los `ping` de los dispositivos Mikrotik. Al guardar un nuevo puerto el servicio se reinicia automáticamente.
