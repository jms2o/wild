# Wilds Online — prototipo

Juego web pixel-art multijugador de exploración y captura de criaturas originales.

## Ejecutar localmente

1. Instala las dependencias: `npm install`
2. Inicia el servidor: `npm run dev`
3. Abre `http://localhost:3000` en el navegador.

Para probar el multijugador, abre dos pestañas e ingresa con nombres distintos.

## Controles

- `WASD` o flechas: mover al explorador.
- `E`: capturar una criatura cercana.
- `B`: retar a un explorador cercano.
- `R`: unirte a la incursión al estar cerca de Cindragon, en Tierras de Ceniza.
- En un duelo o incursión: selecciona uno de los movimientos disponibles.

## Contenido de la segunda fase

- Cuatro zonas conectadas: Claro de Lumbre, Costa de Bruma, Bosque Ámbar y Tierras de Ceniza.
- Criaturas asociadas a cada bioma, con rarezas, tipo elemental y dos movimientos.
- Combates PvP con movimientos diferenciados y recompensas de fragmentos.
- Incursión cooperativa contra **Cindragon**. Los jugadores que participen al derrotarlo obtienen a Cindrake.
- Progreso básico guardado en `data/profiles.json` por nombre de explorador: colección, victorias y fragmentos.

## Siguiente etapa

Agregar cuentas con autenticación, persistencia en PostgreSQL, equipo seleccionable de criaturas, niveles/evoluciones y un sistema de incursiones programadas con recompensas variables.
