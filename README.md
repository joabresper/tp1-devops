# TP1 DevOps

Entorno de práctica para trabajar con contenedores, balanceo de carga y
comunicación entre servicios.

## Arquitectura

```text
Navegador
		|
		v
Nginx reverse proxy :80
		|-----------------------> app-web (Vite) :5173
		|
		+-----------------------> api :3000 (3 instancias)
																	|
																	v
															Redis :6379
```

- El usuario entra por `http://localhost`.
- Nginx envía `/` al frontend y `/api/*` a la API.
- La API es el único servicio que se conecta con Redis.
- Redis no balancea tráfico HTTP. El balanceo entre las instancias de la API
	lo realiza Nginx junto con el DNS interno de Docker.

## Requisitos

- Docker Desktop iniciado.
- Docker Compose incluido en Docker Desktop.
- Puerto `80` disponible en la máquina host. Redis queda en la red interna.

## Iniciar el entorno

Desde la raíz del proyecto:

```powershell
docker compose up --build --scale api=3
```

Para dejarlo corriendo en segundo plano:

```powershell
docker compose up --build --scale api=3 -d
```

`deploy.replicas: 3` está pensado principalmente para Docker Swarm. En Docker
Compose local, `--scale api=3` es lo que crea las tres instancias.

Si se modificaron dependencias de Node y hay volúmenes antiguos de
`node_modules`, recrear los volúmenes anónimos:

```powershell
docker compose up --build --force-recreate -V --scale api=3
```

## URLs

| Recurso | URL |
| --- | --- |
| Aplicación web a través del proxy | <http://localhost> |
| Frontend directo para desarrollo | <http://localhost:5173> |
| Redis dentro de Docker | `redis:6379` (acceso mediante la API o `redis-cli`) |
| Estado de la API y Redis | <http://localhost/api/health> |
| Instancia de la API que responde | <http://localhost/api/instance> |

El frontend debe hacer las llamadas a la API usando rutas relativas, por
ejemplo:

```js
fetch('/api/health')
```

Así el navegador siempre se comunica con el proxy y no necesita conocer el
puerto interno de la API.

## Comandos útiles

Ver el estado de los servicios:

```powershell
docker compose ps
```

Ver los logs de todos los servicios:

```powershell
docker compose logs -f
```

Ver únicamente los logs de la API:

```powershell
docker compose logs -f api
```

Ver la configuración final que interpreta Compose:

```powershell
docker compose config
```

Detener y eliminar los contenedores:

```powershell
docker compose down
```

Detener también los volúmenes del proyecto:

```powershell
docker compose down -v
```

## Probar el balanceo y la tolerancia a fallos

`GET /api/instance` devuelve `{"service":"api","instance":"<hostname>"}`.
Dentro de Docker, el hostname identifica el contenedor que atendió el pedido.
La respuesta no se guarda en caché. Para ver la rotación de las réplicas:

```powershell
1..12 | ForEach-Object { (Invoke-RestMethod http://localhost/api/instance).instance }
```

Se separa de `/api/health`: health hace un PING a Redis y devuelve 200 si está
disponible o 503 si falla; instance sirve para demostrar el balanceo y sigue
respondiendo aunque Redis esté caído.

Comprobar que existen tres instancias:

```powershell
docker compose ps
```

Obtener los nombres de los contenedores de API:

```powershell
docker compose ps -q api
```

Detener una instancia concreta usando su nombre o ID:

```powershell
docker stop <contenedor-api>
```

Repetir las peticiones al proxy mientras una instancia está detenida:

```powershell
curl http://localhost/api/health
```

La aplicación debe seguir respondiendo mientras permanezca disponible al
menos una instancia saludable de la API. Para restaurar el entorno completo:

```powershell
docker compose up -d --scale api=3
```

## Desarrollo local

El servicio `app-web` utiliza el target `development` de su Dockerfile y
ejecuta Vite con `--host`, para que Nginx pueda acceder a él dentro de la red
de Docker. La API ejecuta `node --watch` mediante `npm run dev`.

Los directorios del frontend y de la API se montan como volúmenes, por lo que
los cambios de código se reflejan en los contenedores sin reconstruir la
imagen. Si cambia `package.json` o `package-lock.json`, conviene recrear los
volúmenes con `-V`.

## Pruebas

Con Node.js 22, sin levantar Docker ni Redis (comandos desde la raíz):

```powershell
npm --prefix api ci
npm --prefix api test
```

En PowerShell con scripts deshabilitados, usar `npm.cmd` en lugar de `npm`.
`api/test/app.test.js` usa el runner nativo `node:test` y `node:assert`.
No se agregaron dependencias de pruebas. Levanta Express en un puerto libre
y reemplaza los métodos de Redis por un doble en memoria para aislar la API.

Las siete pruebas cubren CRUD, validación y límites, JSON inválido, tareas
independientes, fallos de Redis, rutas inexistentes, health e identificación
de instancia. El doble no ejecuta Lua ni comprueba Docker: la integración con
Redis real, el balanceo y las caídas se verifican con el entorno levantado.

Para verificar el frontend:

```powershell
npm --prefix app-web ci
npm --prefix app-web run lint
npm --prefix app-web run build
```

## Estructura

```text
.
├── api/                 # Backend Node.js y conexión con Redis
├── app-web/             # Frontend React/Vite
├── proxy/nginx.conf     # Reverse proxy y balanceo hacia la API
└── docker-compose.yaml  # Orquestación de los servicios
```

## Aplicación de tareas

La web permite agregar, listar, editar el título, completar/reabrir y eliminar
tareas. Muestra estados de carga y errores y permite actualizar la lista.
Todas las llamadas usan `/api/tareas` a través del proxy.

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | `/api/tareas` | Listar tareas por título |
| GET | `/api/tareas/:id` | Consultar una tarea |
| POST | `/api/tareas` | Crear una tarea (201) |
| PUT | `/api/tareas/:id` | Reemplazar título y estado |
| DELETE | `/api/tareas/:id` | Eliminar una tarea (204) |

POST y PUT reciben JSON: `{"title":"Estudiar DevOps","completed":false}`.
El título se recorta y debe tener entre 1 y 200 caracteres. `completed` es
booleano y, si se omite, se toma como `false` (PUT reemplaza ambos campos).
Cada tarea tiene un UUID generado por la API. Datos inválidos devuelven 400,
tareas inexistentes 404, cuerpos mayores a 10 KB 413 y errores del servicio 503.

Redis guarda un hash `tareas`: cada campo es el ID y su valor es el JSON de la
tarea. La actualización comprueba existencia y escribe en una sola operación
atómica de Redis, para que un PUT no recree una tarea borrada por otra réplica.
Todas las réplicas comparten los mismos datos.

Redis utiliza AOF y el volumen `redis-data` para conservar tareas al recrear
contenedores. `docker compose down` conserva el volumen; `down -v` lo borra
junto con las tareas. Esta demo usa una lista compartida, sin usuarios.

Para inspeccionar los datos:

```powershell
docker compose exec redis redis-cli HGETALL tareas
```
