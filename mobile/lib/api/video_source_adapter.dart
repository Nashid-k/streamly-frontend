class StreamServer {
  final int id;
  final String name;
  final String Function(int tmdbId, int? season, int? episode, String? imdbId) urlBuilder;
  final String resolverKey;
  final bool usesNativePlayer;

  /// Same page as [urlBuilder] but exposed for the WebView sniffer stage.
  String Function(int tmdbId, int? season, int? episode, String? imdbId)? get embedUrlBuilder => urlBuilder;

  /// Provider short name without the "Server N" prefix, e.g. "CineSrc".
  String get shortName {
    final open = name.indexOf('(');
    final close = name.indexOf(')');
    if (open > 0 && close > open) return name.substring(open + 1, close).trim();
    return name;
  }

  const StreamServer({
    required this.id,
    required this.name,
    required this.urlBuilder,
    this.resolverKey = '',
    this.usesNativePlayer = false,
  });
}

class VideoSourceAdapter {
  static final List<StreamServer> servers = [
    StreamServer(
      id: 1,
      name: 'Server 1 (CineSrc)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://cinesrc.st/embed/tv/$id?s=$s&e=$e&color=%2395ff50&autoplay=true&controls=false&autonext=false'
          : 'https://cinesrc.st/embed/movie/$id?color=%2395ff50&autoplay=true&controls=false',
      resolverKey: 'vidsrc',
      usesNativePlayer: true,
    ),
    StreamServer(
      id: 2,
      name: 'Server 2 (VidLink)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://vidlink.pro/tv/${imdb ?? id}/$s/$e'
          : 'https://vidlink.pro/movie/${imdb ?? id}',
      resolverKey: 'vidlink',
      usesNativePlayer: true,
    ),
    StreamServer(
      id: 3,
      name: 'Server 3 (2Embed)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://www.2embed.cc/embedtv/${imdb ?? id}&s=$s&e=$e'
          : 'https://www.2embed.cc/embed/${imdb ?? id}',
      resolverKey: 'twoembed',
      usesNativePlayer: true,
    ),
    StreamServer(
      id: 4,
      name: 'Server 4 (VidSrc)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://vidsrcme.ru/embed/tv?${imdb != null ? "imdb=$imdb" : "tmdb=$id"}&season=$s&episode=$e'
          : 'https://vidsrcme.ru/embed/movie?${imdb != null ? "imdb=$imdb" : "tmdb=$id"}',
      resolverKey: 'vidsrc',
      usesNativePlayer: true,
    ),
    StreamServer(
      id: 5,
      name: 'Server 5 (VidCore)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://vidcore.io/tv/$id/$s/$e?autoPlay=true&theme=95ff50'
          : 'https://vidcore.io/movie/${imdb ?? id}?autoPlay=true&theme=95ff50',
      resolverKey: 'vidcore',
      usesNativePlayer: true,
    ),
    StreamServer(
      id: 6,
      name: 'Server 6 (Peachify)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://peachify.top/embed/tv/$id/$s/$e?autoNext=false&showNextBtn=false&accent=95ff50'
          : 'https://peachify.top/embed/movie/${imdb ?? id}?accent=95ff50',
      resolverKey: '',
      usesNativePlayer: false,
    ),
    StreamServer(
      id: 7,
      name: 'Server 7 (VidUp)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://vidup.to/tv/$id/$s/$e?autoPlay=true&theme=95ff50&nextButton=false&autoNext=false'
          : 'https://vidup.to/movie/${imdb ?? id}?autoPlay=true&theme=95ff50',
      resolverKey: '',
      usesNativePlayer: false,
    ),
    StreamServer(
      id: 8,
      name: 'Server 8 (SmashyStream)',
      urlBuilder: (id, s, e, imdb) => s != null && e != null
          ? 'https://embed.smashystream.com/playere.php?tmdb=$id&season=$s&episode=$e'
          : 'https://embed.smashystream.com/playere.php?tmdb=$id',
      resolverKey: 'smashystream',
      usesNativePlayer: true,
    ),
  ];

  static String buildStreamUrl({
    required int serverIndex,
    required int tmdbId,
    int? season,
    int? episode,
    String? imdbId,
  }) {
    final boundedIndex =
        (serverIndex >= 0 && serverIndex < servers.length) ? serverIndex : 0;
    final server = servers[boundedIndex];
    return server.urlBuilder(tmdbId, season, episode, imdbId);
  }
}
