# TP1 DevOps

[![CI/CD Pipeline](https://github.com/joabresper/tp1-devops/actions/workflows/ci-cd.yaml/badge.svg?branch=develop)](https://github.com/joabresper/tp1-devops/actions/workflows/ci-cd.yaml)

Entorno de práctica para trabajar con contenedores, balanceo de carga y
comunicación entre servicios.

## Arquitectura

```text
Navegador
		|
		v
Nginx reverse proxy :80
		|-----------------------> app-web (Nginx) :80 (3 instancias)
		|
		+-----------------------> api :3000 (3 instancias)
																	|
																	v
															Redis :6379
```

- El usuario entra por `http://localhost`.
- Nginx envía `/` al frontend y `/api/*` a la API.
- La API es el único servicio que se conecta con Redis.
- Nginx balancea entre tres frontends y tres APIs. Docker resuelve los nombres
  de servicios a sus IP; Nginx distribuye los pedidos entre esas IP.
- El proxy resuelve las IP al iniciar o recargar su configuración. Al recrear
  o escalar contenedores, recargar Nginx para que tome las nuevas IP. Detener
  una réplica no requiere una recarga para que funcionen las restantes.

## Requisitos

- Docker Desktop iniciado.
- Docker Compose incluido en Docker Desktop.
- Puerto `80` disponible en la máquina host. Redis queda en la red interna.

## Iniciar el entorno

Desde la raíz del proyecto:

```powershell
docker compose up --build
```

Para dejarlo corriendo en segundo plano:

```powershell
docker compose up --build -d --wait
docker compose exec proxy nginx -s reload
```

Docker Compose v2 respeta `deploy.replicas: 3` para ambos servicios. Se esperan
ocho contenedores: tres frontends, tres APIs, Redis y el proxy. Los healthchecks
permiten esperar a que Redis, la API y el frontend estén listos antes del proxy.
También se puede indicar explícitamente `--scale api=3 --scale app-web=3`.

Si se modificaron dependencias de Node y hay volúmenes antiguos de
`node_modules`, recrear los volúmenes anónimos:

```powershell
docker compose up --build --force-recreate -V -d --wait
docker compose exec proxy nginx -s reload
```

## URLs

| Recurso | URL |
| --- | --- |
| Aplicación web a través del proxy | <http://localhost> |
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

La web muestra el frontend que sirvió el HTML y la API que respondió la última
petición de tareas. El frontend inyecta su hostname en el HTML; la API incluye
`X-API-Instance` en cada respuesta, incluso errores y eliminaciones sin cuerpo.
No se hace una consulta de diagnóstico adicional que pudiera tocar otra réplica.
Usar **Actualizar** o modificar una tarea cambia el indicador de API; recargar
la página permite ver el frontend que atiende la nueva carga. Los nombres pueden
repetirse: otras peticiones también participan del balanceo. Fuera de Nginx, el
frontend se identifica como `Sin Nginx`.

`GET /api/instance` devuelve `{"service":"api","instance":"<hostname>"}`.
Dentro de Docker, el hostname identifica el contenedor que atendió el pedido.
La respuesta no se guarda en caché. Para ver la rotación de las réplicas:

```powershell
1..12 | ForEach-Object { (Invoke-RestMethod http://localhost/api/instance).instance }
```

Para identificar el frontend, cada Nginx devuelve su hostname en el encabezado
`X-Frontend-Instance` (consultar varias veces para ver los tres valores):

```powershell
1..12 | ForEach-Object { (Invoke-WebRequest -UseBasicParsing http://localhost/).Headers['X-Frontend-Instance'] }
```

Se separa de `/api/health`: health hace un PING a Redis y devuelve 200 si está
disponible o 503 si falla; instance sirve para demostrar el balanceo y sigue
respondiendo aunque Redis esté caído.

Comprobar las tres instancias de cada servicio:

```powershell
docker compose ps
```

Detener una instancia de cada servicio (PowerShell):

```powershell
$apiId = docker compose ps -q api | Select-Object -First 1
$frontId = docker compose ps -q app-web | Select-Object -First 1
docker stop $apiId $frontId
```

Repetir las peticiones al proxy mientras una instancia está detenida:

```powershell
Invoke-RestMethod http://localhost/api/health
Invoke-WebRequest -UseBasicParsing http://localhost/ | Select-Object StatusCode
```

Repetir también las consultas de instancia y usar la web para crear o editar
una tarea. Nginx evita temporalmente los destinos que fallan y reintenta ante
errores de conexión; no se habilitan reintentos de POST ya enviados, para evitar
duplicar creaciones. Para restaurar el entorno completo:

```powershell
docker compose up -d --wait
docker compose exec proxy nginx -s reload
```

La tolerancia cubre la caída de réplicas de web/API; Redis y el proxy siguen
siendo únicos. Si Redis cae, las operaciones de tareas y health fallan con 503,
aunque `/api/instance` puede seguir respondiendo.

## Desarrollo local

Compose usa el target `production` del frontend: Vite compila una vez y las
tres réplicas sirven los mismos archivos estáticos con Nginx. No hay servidor
Vite ni puerto 5173 publicados en este entorno. Después de cambiar la web:

```powershell
docker compose up --build -d --wait
docker compose exec proxy nginx -s reload
```

El target `development` sigue disponible en el Dockerfile, pero no se utiliza
para la demostración de réplicas. La API mantiene `npm run dev` y el montaje
del código. Si Windows no propaga cambios a `node --watch`, ejecutar
`docker compose restart api`. Si cambian dependencias de la API, recrear sus
volúmenes anónimos con `-V` como se indica arriba.

Si se modifica `proxy/nginx.conf` con el proxy ya levantado, validar y recargar
la configuración con `docker compose exec proxy nginx -t` y
`docker compose exec proxy nginx -s reload`.

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
Se conserva un único runner: `node:test`. CI ejecuta el mismo `npm test`;
migrar a Jest no aporta cobertura adicional y agrega dependencias innecesarias.

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

## Automatización y producción

El workflow `.github/workflows/ci-cd.yaml` conserva la automatización de
`develop`, adaptada a la aplicación integrada:

- En pushes a `main`, `develop` y `feature/**`, y PR hacia `main` o `develop`,
  ejecuta las pruebas de API, lint y compilación del frontend con Node.js 22.
- Trivy analiza vulnerabilidades de dependencias; bloquea la publicación si
  encuentra vulnerabilidades HIGH o CRITICAL con corrección disponible.
  Este análisis no sustituye un SAST del código fuente ni una calificación
  de calidad de código.
- Solo un push a `main`, con ambos jobs aprobados, construye y publica las
  imágenes `tp1-devops-api:latest` y `tp1-devops-app-web:latest` en Docker Hub.
  Requiere los secrets `DOCKER_USERNAME` y `DOCKER_PASSWORD` (token de Docker Hub).
- El workflow publica imágenes; el despliegue en un servidor sigue siendo manual.
  El badge enlaza el estado real del workflow en `develop`.

En el servidor con Docker, copiar `docker-compose.prod.yaml` y
`proxy/nginx.conf`, conservando esa estructura. Crear un archivo `.env` junto
al Compose con `DOCKER_USERNAME=nombre_real_de_la_cuenta` (sin contraseña).
Una vez publicadas las imágenes desde `main`:

```sh
docker compose -f docker-compose.prod.yaml pull
docker compose -f docker-compose.prod.yaml up -d --wait
docker compose -f docker-compose.prod.yaml exec proxy nginx -s reload
```

El Compose de producción usa las imágenes publicadas, tres frontends Nginx,
tres APIs, healthchecks y Redis persistente. No monta código ni ejecuta Vite
o el watcher de Node. Publica el puerto 80 del servidor. Para desarrollo local
se utiliza el `docker-compose.yaml` habitual con `--build`.

El CRUD integrado usa el hash `tareas` de la rama feature. Los datos que la
antigua API de `develop` guardaba en `todos_list` no se migran automáticamente;
esa clave no se elimina y la aplicación nueva no la consulta.

## Estructura

```text
.
├── api/                 # Backend Node.js y conexión con Redis
├── app-web/             # Frontend React/Vite
├── proxy/nginx.conf     # Reverse proxy y balanceo hacia web y API
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
