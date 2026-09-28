import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../api/movie_service.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';
import '../widgets/page_header.dart';

class PersonScreen extends StatefulWidget {
  final int personId;
  final String name;

  const PersonScreen({super.key, required this.personId, required this.name});

  @override
  State<PersonScreen> createState() => _PersonScreenState();
}

class _PersonScreenState extends State<PersonScreen> {
  PersonDetails? _details;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadDetails();
  }

  Future<void> _loadDetails() async {
    try {
      final d = await MovieService.getPersonDetails(widget.personId);
      if (mounted) {
        setState(() {
          _details = d;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(AppTheme.accentLime),
              ),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              physics: const BouncingScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  PageHeader(
                    title: widget.name,
                    onBack: () => Navigator.pop(context),
                  ),
                  // Avatar & Quick Meta Row
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: SizedBox(
                          width: 100,
                          height: 140,
                          child: _details?.avatarUrl.isNotEmpty == true
                              ? CachedNetworkImage(
                                  imageUrl: _details!.avatarUrl,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => Container(
                                    color: AppTheme.card,
                                    child: const Icon(Icons.person, color: AppTheme.textFaint),
                                  ),
                                )
                              : Container(
                                  color: AppTheme.card,
                                  child: const Icon(Icons.person, color: AppTheme.textFaint),
                                ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _details?.name ?? widget.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 6),
                            if (_details?.birthday != null)
                              Text(
                                'Born: ${_details!.birthday}',
                                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                              ),
                            if (_details?.placeOfBirth != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                _details!.placeOfBirth!,
                                style: const TextStyle(color: AppTheme.textFaint, fontSize: 12),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Biography
                  if (_details?.biography != null && _details!.biography!.isNotEmpty) ...[
                    const Text(
                      'Biography',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _details!.biography!,
                      style: const TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 13,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Known For / Filmography
                  if (_details != null && _details!.credits.isNotEmpty) ...[
                    Text(
                      'Filmography (${_details!.credits.length})',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 14),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _details!.credits.length,
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        childAspectRatio: 0.52,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 12,
                      ),
                      itemBuilder: (context, index) {
                        return MovieCard(
                          movie: _details!.credits[index],
                          width: null,
                          height: null,
                          margin: EdgeInsets.zero,
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}
