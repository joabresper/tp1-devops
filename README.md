# TP1 DevOps

[![CI/CD Pipeline](https://github.com/tu_usuario/tp1-devops/actions/workflows/ci-cd.yaml/badge.svg)](https://github.com/tu_usuario/tp1-devops/actions)
[![Security Scan](https://img.shields.io/badge/SAST-Trivy-blue.svg)](https://github.com/tu_usuario/tp1-devops/actions)


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
- Puertos `80` y `6379` disponibles en la máquina host.

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
| Redis desde el host | `localhost:6379` |
| Health de la API, cuando esté disponible | <http://localhost/api/health> |

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

## Estructura

```text
.
├── api/                 # Backend Node.js y conexión con Redis
├── app-web/             # Frontend React/Vite
├── proxy/nginx.conf     # Reverse proxy y balanceo hacia la API
└── docker-compose.yaml  # Orquestación de los servicios
```

## Estado del proyecto

La infraestructura base está preparada para:

- levantar un frontend detrás de Nginx;
- ejecutar tres instancias de la API;
- conectar todas las instancias al mismo Redis;
- comprobar el comportamiento cuando una instancia de la API se detiene.

Los endpoints de negocio y las operaciones concretas sobre Redis se irán
agregando en la API.

## Despliegue en la Nube (Producción)

Para desplegar la aplicación en un servidor en la nube (ej. VPS en AWS, DigitalOcean):

1. Clona este repositorio o copia el archivo `docker-compose.prod.yaml` a tu servidor.
2. Define la variable de entorno con tu usuario de Docker Hub: `export DOCKER_USERNAME=tu_usuario`
3. Inicia el entorno con: `docker compose -f docker-compose.prod.yaml up -d`

Las imágenes se descargarán automáticamente desde Docker Hub.