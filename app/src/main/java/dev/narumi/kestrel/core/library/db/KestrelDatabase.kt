package dev.narumi.kestrel.core.library.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [
        PlaceEntity::class,
        RouteEntity::class,
        RouteRevisionEntity::class,
        WaypointEntity::class,
        LibraryItemEntity::class,
        SyncStateEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
@TypeConverters(LibraryConverters::class)
abstract class KestrelDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao

    companion object {
        @Volatile private var instance: KestrelDatabase? = null

        fun getInstance(context: Context): KestrelDatabase =
            instance ?: synchronized(this) {
                instance ?: Room
                    .databaseBuilder(
                        context.applicationContext,
                        KestrelDatabase::class.java,
                        "kestrel.db",
                    ).build()
                    .also { instance = it }
            }
    }
}
