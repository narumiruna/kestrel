package dev.narumi.kestrel.core.library.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        PlaceEntity::class,
        RouteEntity::class,
        RouteRevisionEntity::class,
        WaypointEntity::class,
        LibraryItemEntity::class,
        SyncStateEntity::class,
        PendingSyncChangeEntity::class,
        SyncConflictEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
@TypeConverters(LibraryConverters::class)
abstract class KestrelDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao

    companion object {
        @Volatile private var instance: KestrelDatabase? = null

        private val MIGRATION_1_2 =
            object : Migration(1, 2) {
                override fun migrate(db: SupportSQLiteDatabase) {
                    db.execSQL("ALTER TABLE library_items ADD COLUMN remote_version INTEGER")
                    db.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS pending_sync_changes (
                            id TEXT NOT NULL PRIMARY KEY,
                            library_item_id TEXT NOT NULL,
                            client_mutation_id TEXT NOT NULL,
                            type TEXT NOT NULL,
                            base_version INTEGER,
                            payload_json TEXT NOT NULL,
                            created_at INTEGER NOT NULL,
                            updated_at INTEGER NOT NULL
                        )
                        """.trimIndent(),
                    )
                    db.execSQL(
                        "CREATE INDEX IF NOT EXISTS index_pending_sync_changes_library_item_id " +
                            "ON pending_sync_changes(library_item_id)",
                    )
                    db.execSQL(
                        """
                        CREATE TABLE IF NOT EXISTS sync_conflicts (
                            id TEXT NOT NULL PRIMARY KEY,
                            library_item_id TEXT NOT NULL,
                            pending_change_id TEXT NOT NULL,
                            kind TEXT NOT NULL,
                            base_version INTEGER,
                            remote_version INTEGER NOT NULL,
                            local_snapshot_json TEXT NOT NULL,
                            cloud_snapshot_json TEXT NOT NULL,
                            created_at INTEGER NOT NULL
                        )
                        """.trimIndent(),
                    )
                    db.execSQL(
                        "CREATE INDEX IF NOT EXISTS index_sync_conflicts_library_item_id " +
                            "ON sync_conflicts(library_item_id)",
                    )
                }
            }

        fun getInstance(context: Context): KestrelDatabase =
            instance ?: synchronized(this) {
                instance ?: Room
                    .databaseBuilder(
                        context.applicationContext,
                        KestrelDatabase::class.java,
                        "kestrel.db",
                    ).addMigrations(MIGRATION_1_2)
                    .build()
                    .also { instance = it }
            }
    }
}
