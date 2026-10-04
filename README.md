# OCE Preset GitOps

## Français

CLI pour versionner les Presets d'OpenClaw Enterprise (OCE) dans Git et détecter les écarts avec une installation. OCE copie un Preset au moment de créer un agent ; il ne conserve ni historique de versions du Preset ni lien de provenance avec l'agent créé. Ce dépôt apporte un historique **des fichiers sources** et un plan de synchronisation, sans prétendre modifier les agents existants. [Contrat officiel des Presets](https://docs-enterprise.openclaw.org/reference/presets/).

Créer un fichier JSON par Preset dans `presets/` avec `namespaceId`, `name` et `template`. L'exemple est un modèle minimal à personnaliser ; son namespace synthétique doit être remplacé. Copier `config.example.json` vers `config.json` (ignoré par Git), renseigner l'URL OCC, le dossier des Presets et le chemin d'une clé de service conservée dans un fichier `600`. La clé doit avoir les permissions Preset nécessaires. Ne jamais enregistrer de mot de passe ou de jeton comme valeur ordinaire d'un template Git.

```sh
node cli.js plan config.json
node cli.js check config.json
node cli.js apply config.json
```

`plan` lit OCC et affiche `create`, `update` ou `unchanged`, des empreintes des templates et les identifiants ; il n'affiche pas les valeurs des templates. `check` sort avec le code `2` si un écart existe, utile en CI. `apply` crée ou remplace les templates concernés ; il relit chaque Preset avant une mise à jour et refuse un écart survenu depuis le plan. Il ne supprime aucun Preset distant. L'API ne fournit pas de mise à jour conditionnelle : un autre écrivain peut encore intervenir entre cette relecture et le `PATCH`. Un échec après plusieurs écritures laisse les écritures déjà réussies en place ; relancer `plan` avant de reprendre.

`npm test` couvre création, mise à jour, idempotence et refus d'un plan périmé contre un faux serveur local. Aucune installation OCE réelle n'a été modifiée par la CI. Licence MIT.

## English

CLI to version OpenClaw Enterprise (OCE) Presets in Git and detect drift against an installation. OCE copies a Preset when creating an agent; it records neither Preset version history nor provenance on the created agent. This repository provides history **for source files** and a synchronization plan without claiming to update existing agents. See the [official Preset contract](https://docs-enterprise.openclaw.org/reference/presets/).

Create one JSON file per Preset in `presets/` with `namespaceId`, `name`, and `template`. The example is a minimal template to customize; replace its synthetic namespace. Copy `config.example.json` to `config.json` (Git ignored), set the OCC URL, Preset directory, and path to a service key in a `600` file. The key needs the relevant Preset permissions. Never commit a password or token as an ordinary Git template value. Run the commands above.

`plan` reads OCC and reports `create`, `update`, or `unchanged`, template fingerprints, and IDs; it does not print template values. `check` exits `2` on drift for CI. `apply` creates or replaces affected templates; it rereads each Preset before update and rejects a change since the plan. It never deletes remote Presets. The API has no conditional update, so another writer may still act between the reread and `PATCH`. A failure after multiple writes leaves earlier successful writes in place; rerun `plan` before resuming.

`npm test` covers creation, update, idempotence, and stale-plan rejection against a local mock server. Public CI changes no real OCE installation. MIT licensed.

## Español

CLI para versionar Presets de OpenClaw Enterprise (OCE) en Git y detectar diferencias con una instalación. OCE copia un Preset al crear un agente; no conserva historial de versiones del Preset ni procedencia en el agente creado. Este repositorio aporta historial **de los archivos fuente** y un plan de sincronización, sin afirmar que actualiza agentes existentes. Consulta el [contrato oficial de Presets](https://docs-enterprise.openclaw.org/reference/presets/).

Crea un archivo JSON por Preset en `presets/` con `namespaceId`, `name` y `template`. El ejemplo es una plantilla mínima para personalizar; sustituye su espacio de nombres sintético. Copia `config.example.json` a `config.json` (ignorado por Git), configura la URL de OCC, el directorio de Presets y la ruta de una clave de servicio guardada en un archivo con permisos `600`. La clave necesita los permisos de Preset correspondientes. Nunca publiques contraseñas o tokens como valores ordinarios de una plantilla Git. Ejecuta los comandos anteriores.

`plan` lee OCC y muestra `create`, `update` o `unchanged`, huellas de los templates e identificadores; no muestra los valores. `check` termina con código `2` si hay diferencias, útil en CI. `apply` crea o reemplaza los templates afectados; vuelve a leer cada Preset antes de actualizar y rechaza cambios posteriores al plan. Nunca elimina Presets remotos. La API no permite actualizaciones condicionales: otro escritor aún puede intervenir entre la relectura y el `PATCH`. Si falla tras varias escrituras, las ya completadas permanecen; vuelve a ejecutar `plan` antes de continuar.

`npm test` cubre creación, actualización, idempotencia y rechazo de un plan obsoleto con un servidor local simulado. La CI pública no modifica instalaciones OCE reales. Licencia MIT.
