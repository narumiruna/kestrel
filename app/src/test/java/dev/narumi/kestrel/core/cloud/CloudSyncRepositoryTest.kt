package dev.narumi.kestrel.core.cloud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudSyncRepositoryTest {
    @Test
    fun `sync requires bootstrap when cursor is missing`() {
        val state = CloudSyncState(cursor = null, userId = "user-1")

        assertTrue(state.requiresBootstrapFor("user-1"))
    }

    @Test
    fun `sync requires bootstrap when stored user is missing`() {
        val state = CloudSyncState(cursor = "42", userId = null)

        assertTrue(state.requiresBootstrapFor("user-1"))
    }

    @Test
    fun `sync requires bootstrap when stored user differs from session user`() {
        val state = CloudSyncState(cursor = "42", userId = "user-1")

        assertTrue(state.requiresBootstrapFor("user-2"))
    }

    @Test
    fun `sync requires bootstrap when synced content is missing library items`() {
        val state = CloudSyncState(cursor = "42", userId = "user-1")

        assertTrue(state.requiresBootstrapFor("user-1", hasSyncedContentMissingLibraryItems = true))
    }

    @Test
    fun `sync can use changes when cursor belongs to session user`() {
        val state = CloudSyncState(cursor = "42", userId = "user-1")

        assertFalse(state.requiresBootstrapFor("user-1"))
    }

    @Test
    fun `collect library items includes embedded place and route items`() {
        val explicitItem = cloudLibraryItem(id = "item-explicit", placeId = "place-explicit")
        val embeddedPlaceItem = cloudLibraryItem(id = "item-place", placeId = "place-1")
        val embeddedRouteItem =
            cloudLibraryItem(
                id = "item-route",
                kind = CloudLibraryItemKind.ROUTE,
                routeId = "route-1",
            )

        val items =
            collectCloudLibraryItems(
                places = listOf(cloudPlace(libraryItem = embeddedPlaceItem)),
                routes = listOf(cloudRoute(libraryItem = embeddedRouteItem)),
                libraryItems = listOf(explicitItem),
            )

        assertTrue(items.map(CloudLibraryItemPayload::id).containsAll(listOf("item-explicit", "item-place", "item-route")))
    }

    @Test
    fun `collect library items keeps explicit item when embedded duplicate exists`() {
        val explicitItem = cloudLibraryItem(id = "item-1", placeId = "place-explicit")
        val embeddedItem = cloudLibraryItem(id = "item-1", placeId = "place-embedded")

        val items =
            collectCloudLibraryItems(
                places = listOf(cloudPlace(libraryItem = embeddedItem)),
                routes = emptyList(),
                libraryItems = listOf(explicitItem),
            )

        assertFalse(items.single().placeId == "place-embedded")
    }
}

private fun cloudLibraryItem(
    id: String,
    kind: CloudLibraryItemKind = CloudLibraryItemKind.PLACE,
    placeId: String? = null,
    routeId: String? = null,
): CloudLibraryItemPayload =
    CloudLibraryItemPayload(
        createdAt = "2026-05-09T17:00:00Z",
        id = id,
        kind = kind,
        placeId = placeId,
        routeId = routeId,
        sortOrder = 0,
        updatedAt = "2026-05-09T17:00:00Z",
    )

private fun cloudPlace(libraryItem: CloudLibraryItemPayload?): CloudPlacePayload =
    CloudPlacePayload(
        createdAt = "2026-05-09T17:00:00Z",
        id = "place-1",
        libraryItem = libraryItem,
        latitude = 25.033,
        longitude = 121.565,
        name = "Place",
        updatedAt = "2026-05-09T17:00:00Z",
    )

private fun cloudRoute(libraryItem: CloudLibraryItemPayload?): CloudRoutePayload =
    CloudRoutePayload(
        createdAt = "2026-05-09T17:00:00Z",
        currentRevision =
            CloudRouteRevisionPayload(
                createdAt = "2026-05-09T17:00:00Z",
                createdBy = "user-1",
                defaultSpeedKmh = 20.0,
                id = "revision-1",
                mode = CloudRouteMode.LOOP,
                revisionNumber = 1,
            ),
        defaultSpeedKmh = 20.0,
        id = "route-1",
        libraryItem = libraryItem,
        mode = CloudRouteMode.LOOP,
        name = "Route",
        updatedAt = "2026-05-09T17:00:00Z",
    )
