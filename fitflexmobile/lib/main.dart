import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_scope.dart';
import 'shared/api_client.dart';
import 'shared/auth_state.dart';
import 'shared/design_tokens.dart';
import 'shared/i18n.dart';
import 'screens/home_screen.dart';
import 'screens/language_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  final api = ApiClient();
  final auth = AuthState(api);
  await auth.hydrate();

  final prefs = await SharedPreferences.getInstance();
  final locale = FFLocale();
  final saved = prefs.getString('locale');
  if (saved != null) locale.set(Locale(saved));

  runApp(FitFlexApp(api: api, auth: auth, locale: locale));
}

class FitFlexApp extends StatelessWidget {
  const FitFlexApp({
    super.key,
    required this.api,
    required this.auth,
    required this.locale,
  });

  final ApiClient api;
  final AuthState auth;
  final FFLocale locale;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      api: api,
      auth: auth,
      child: FFLocaleScope(
        notifier: locale,
        child: AnimatedBuilder(
          animation: Listenable.merge([auth, locale]),
          builder: (context, _) {
            return MaterialApp(
              title: 'FitFlex Af',
              debugShowCheckedModeBanner: false,
              theme: buildTheme(),
              locale: locale.locale,
              supportedLocales: const [Locale('en'), Locale('sw')],
              localizationsDelegates: const [
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: auth.isSignedIn
                  ? const HomeScreen()
                  : const LanguageScreen(),
            );
          },
        ),
      ),
    );
  }
}
