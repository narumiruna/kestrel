package dev.narumi.kestrel.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Route
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

object KestrelIcons {
    val Cloud = Icons.Outlined.CloudQueue
    val Confirm = Icons.Filled.Check
    val Devices = Icons.Outlined.Devices
    val Dismiss = Icons.Filled.Close
    val Explore = Icons.Outlined.Explore
    val FavoriteFilled = Icons.Filled.Star
    val FavoriteOutlined = Icons.Outlined.StarBorder
    val Link = Icons.Outlined.Link
    val MapFilled = Icons.Filled.Map
    val MapOutlined = Icons.Outlined.Map
    val More = Icons.Filled.MoreVert
    val MyLocation = Icons.Filled.MyLocation
    val Pause = Icons.Filled.Pause
    val Place = Icons.Filled.Place
    val Play = Icons.Filled.PlayArrow
    val Restore = Icons.Outlined.Restore
    val RouteFilled = Icons.Filled.Route
    val RouteOutlined = Icons.Outlined.Route
    val Search = Icons.Filled.Search
    val SettingsFilled = Icons.Filled.Settings
    val SettingsOutlined = Icons.Outlined.Settings
    val Sort = Icons.Filled.ArrowDropDown
    val Stop = Icons.Filled.Stop
}

object KestrelIconSizes {
    val Default = 24.dp
    val Badge = 22.dp
    val EmptyState = 32.dp
}

@Composable
fun KestrelIcon(
    imageVector: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    tint: Color = LocalContentColor.current,
    size: Dp = KestrelIconSizes.Default,
) {
    Icon(
        imageVector = imageVector,
        contentDescription = contentDescription,
        modifier = modifier.size(size),
        tint = tint,
    )
}
