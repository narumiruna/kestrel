package dev.narumi.kestrel.core.data

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.StructureKind
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

/**
 * Encodes known fields while retaining fields written by a newer app version.
 *
 * `ignoreUnknownKeys` makes forward reads safe, but a normal decode/copy/encode cycle silently
 * drops unknown fields. DataStore settings are long-lived and can be read by mixed app versions,
 * so known-field writes merge recursively into the previous JSON instead.
 */
@OptIn(ExperimentalSerializationApi::class)
internal fun <T> Json.encodePreservingUnknown(
    serializer: KSerializer<T>,
    value: T,
    previousJson: String?,
): String {
    val encoded = encodeToJsonElement(serializer, value)
    val previous =
        previousJson?.let { raw ->
            runCatching { parseToJsonElement(raw) }.getOrNull()
        }
    val merged = mergeKnownValue(previous, encoded, serializer.descriptor)
    return encodeToString(JsonElement.serializer(), merged)
}

@OptIn(ExperimentalSerializationApi::class)
private fun mergeKnownValue(
    previous: JsonElement?,
    encoded: JsonElement,
    descriptor: SerialDescriptor,
): JsonElement =
    when (descriptor.kind) {
        StructureKind.CLASS, StructureKind.OBJECT ->
            mergeObject(
                previous = previous as? JsonObject,
                encoded = encoded.jsonObject,
                descriptor = descriptor,
            )
        StructureKind.LIST ->
            mergeList(
                previous = previous as? JsonArray,
                encoded = encoded as JsonArray,
                descriptor = descriptor,
            )
        else -> encoded
    }

@OptIn(ExperimentalSerializationApi::class)
private fun mergeObject(
    previous: JsonObject?,
    encoded: JsonObject,
    descriptor: SerialDescriptor,
): JsonObject {
    val knownNames = (0 until descriptor.elementsCount).associateBy(descriptor::getElementName)
    val merged = previous.orEmpty().filterKeys { it !in knownNames }.toMutableMap()
    encoded.forEach { (name, value) ->
        val index = knownNames[name]
        merged[name] =
            if (index == null) {
                value
            } else {
                mergeKnownValue(previous?.get(name), value, descriptor.getElementDescriptor(index))
            }
    }
    return JsonObject(merged)
}

@OptIn(ExperimentalSerializationApi::class)
private fun mergeList(
    previous: JsonArray?,
    encoded: JsonArray,
    descriptor: SerialDescriptor,
): JsonArray {
    val elementDescriptor = descriptor.getElementDescriptor(0)
    return JsonArray(
        encoded.mapIndexed { index, value ->
            val previousValue = previous?.getOrNull(index)
            val safePrevious =
                if (value is JsonObject && previousValue is JsonObject) {
                    previousValue.takeIf { sameStableIdentity(it, value) }
                } else {
                    previousValue
                }
            mergeKnownValue(safePrevious, value, elementDescriptor)
        },
    )
}

private fun sameStableIdentity(
    previous: JsonObject,
    encoded: JsonObject,
): Boolean {
    val identityKeys = listOf("id", "commandId", "clientDeviceId", "deviceId", "sessionId")
    val sharedKeys = identityKeys.filter { it in previous && it in encoded }
    return sharedKeys.isNotEmpty() && sharedKeys.all { previous[it] == encoded[it] }
}
