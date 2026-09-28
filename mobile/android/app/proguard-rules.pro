# Streamly — release keep rules for the native player stack

# better_player_plus communicates with the Flutter side over Pigeon/Plugin
# channels; keep its native surface so R8 cannot strip channel entry points.
-keep class uz.shs.better_player_plus.** { *; }
-dontwarn uz.shs.better_player_plus.**

# Media3 / ExoPlayer
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# flutter_inappwebview (headless sniffer for JS-only embed pages)
-keep class com.pichillilorenzo.** { *; }
-dontwarn com.pichillilorenzo.**

# Room reflection: generated *_Impl classes are loaded by name and built via a
# no-arg constructor.
-keep class androidx.work.** { *; }
-keep class androidx.work.impl.** { *; }
-keep class **.*_Impl { <init>(...); }
-keep class * extends androidx.room.RoomDatabase { <init>(...); }
-keep class * extends androidx.work.impl.WorkDatabase { <init>(...); }
-dontwarn androidx.work.**

