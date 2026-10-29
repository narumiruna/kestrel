# Route assistant source terms

Reviewed against public source documentation on 2026-10-28. This records the supported data flow, not a provider endorsement or a guarantee of future terms.

## Supported capture sources

`plain`, `dark`, and `terrain` use the same OpenStreetMap standard raster source. The last two are color treatments. Capture reuses a rendered frame; it does not fetch tiles, prefetch another area, query map features, or download a dataset.

Official evidence:

- [OSM copyright and license](https://www.openstreetmap.org/copyright): ODbL permits copying, transmitting, and adapting data with attribution and applicable share-alike obligations.
- [OSMF legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ), sections 1.3 and 1.8.1: use for any purpose is permitted; an attributed screenshot in a digital publication is permitted. Put the copyright notice on the image and identify `openstreetmap.org/copyright`.
- [Attribution Guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), static images, routing engines, and machine learning: attribute static images and the application. The routing safe harbour does not require attribution on each instruction unless the result forms a Derivative Database. The machine-learning example concerns training; it is not a source-specific ban on sending an attributed screenshot for inference. Recreating substantial OSM data remains subject to ODbL.
- [Standard tile policy](https://operations.osmfoundation.org/policies/tiles/): normal rendering must keep attribution, browser Referer, identification, and HTTP cache behavior. Bulk download, prefetch, and default cache bypass are prohibited. Availability is best effort. OSMF can block access; the open-data license does not supply commercial hosting capacity.

The supported operation is one attributed, user-selected screenshot sent with a request for transient visual inference. This permission comes from the content license, not from successful canvas export. Kestrel does not create a training dataset or reconstruct a road database. Users must retain applicable ODbL obligations if they redistribute derived data; this feature does not grant a different license to OSM content.

## Attribution after Apply and Save

The PNG contains `© OpenStreetMap contributors` and the full copyright URL in a separate footer. The footer is outside the path coordinate rectangle. Route editing and preview maps keep an OSM attribution link even when their base style changes. The Android map already uses an attributed OSM source and keeps its native attribution control visible.

Only OSM-derived capture is enabled, so application-level route attribution can remain available without persisting an image or adding route provenance fields. Existing route JSON, revision, sync, Share, and Android waypoint schemas remain unchanged. Public route consumers must retain the source credit and applicable ODbL obligations described here. A future source with different persistence requirements needs a separate review; do not enable it by assuming this decision applies.

## Disabled source

`satellite` uses [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9). Its attribution names Esri and imagery suppliers. [Esri legal terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) and [data attribution terms](https://www.esri.com/en-us/legal/terms/data-attributions) do not, by themselves, establish permission for this application's MapLibre screenshot-to-model and derived-path flow.

Satellite capture is disabled. Existing satellite rendering/manual editing is unchanged. Do not treat an AI-training restriction as a proven inference prohibition; the unresolved transfer and derived-output permission is enough to keep this capture source disabled. The source/account owner must obtain the required supplier permissions and resolve output attribution before enabling it. No account action or supplier request was performed.

## AI provider and retention

The user chooses an image-capable chat model through existing personal AI settings and supplies its credential. No shared AI account or routing/search supplier is used. Each run requires confirmation of the exact screenshot and disclosure of precise-position exposure, possible image charges, and provider retention.

Kestrel keeps only bounded editor/run memory, clears images on removal, invalidation, cancellation, expiry, Apply/discard, or session end, and never saves assistant prompts/images to the database. Existing manual Save stores approved route geometry. `cacheRetention: none` asks the SDK not to request prompt caching; it is not a promise that the upstream provider keeps no data or does no training. Account owners must check their chosen provider's current product/account terms. No provider approval gate or silent model substitution is added.

A disconnected stream is not proof that upstream processing stopped. Cancellation aborts the local request and worker; billing, provider-side cancellation, and provider retention are not guaranteed. No live inference or provider-account permission change is part of fixture verification.
