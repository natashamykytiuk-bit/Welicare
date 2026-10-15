import {
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import BackButton from '../components/BackButton';
import { colors, fonts } from '../theme';

const CONTACT_EMAIL = 'natasha.mykytiuk@gmail.com';

// Reached from Settings' "Accessibility" row. The in-app copy of the
// accessibility statement; docs/accessibility-statement.md is the same text
// for welicare.ca, so update both together. Plain text sections rather than
// a markdown renderer: no extra dependency, and every heading gets
// accessibilityRole="header" so VoiceOver users can jump between sections
// with the rotor.
const SECTIONS = [
  {
    heading: 'Our commitment',
    paragraphs: [
      'We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1, Level AA in the Welicare app and on welicare.ca. Accessibility is part of how we design and test new features. We have reviewed the app against these guidelines ourselves, and we are still working towards full conformance (see the known limitations below).',
    ],
  },
  {
    heading: 'Features that support accessibility',
    bullets: [
      "VoiceOver and TalkBack: buttons, photos and game pieces have spoken labels. Menus keep the screen reader's focus inside them until they close. PIN entry tells you how many digits you've entered.",
      "Larger text: text follows the size you choose in your device's settings.",
      'Reduce Motion: when it is on in your device settings, the games skip bouncing and pulsing animations.',
      'Colour contrast: text and controls meet WCAG AA contrast, and information is never shown by colour alone.',
      "Large touch targets: buttons are at least 44 points. Resident Mode's Back and Home buttons and the music controls are larger again.",
      'Readable fonts: Atkinson Hyperlegible, a typeface designed for low-vision readers.',
      'Games with no pressure: no countdowns, no "game over" and no "wrong" messages.',
      "Your own Play/Pause button in the music player, so you don't have to rely on YouTube's small controls.",
    ],
  },
  {
    heading: 'Known limitations',
    bullets: [
      "The YouTube player's built-in controls are small and are labelled by YouTube, not by us.",
      'At the largest text sizes, some text in fixed-size areas (the number keypad, game cards) may be cut off.',
      'Some text in Resident Mode, such as song and movie titles, is smaller than our 24-point goal.',
      'We have not yet finished testing every screen with VoiceOver on iPhone and iPad.',
    ],
  },
];

export default function AccessibilityStatementScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton navigation={navigation} />
        <Text style={styles.heading} accessibilityRole="header">
          Accessibility
        </Text>
        <Text style={styles.body}>
          Welicare is built for people living in care homes, many of them with dementia, and for the
          family, staff and volunteers who support them. We want everyone to be able to use the app
          comfortably.
        </Text>

        {SECTIONS.map((section) => (
          <SectionBlock key={section.heading} {...section} />
        ))}

        <Text style={styles.sectionHeading} accessibilityRole="header">
          Feedback and contact
        </Text>
        <Text style={styles.body}>
          If anything in Welicare is hard to use, please tell us which screen you were on, your
          device, and any accessibility settings you had on. We aim to reply within 5 business days.
        </Text>
        <TouchableOpacity
          style={styles.emailButton}
          onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
          accessibilityRole="link"
          accessibilityLabel={`Email ${CONTACT_EMAIL}`}
          accessibilityHint="Opens your email app"
        >
          <Text style={styles.emailText}>{CONTACT_EMAIL}</Text>
        </TouchableOpacity>

        <Text style={styles.updated}>Last updated October 15, 2026</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// One titled section: optional paragraphs, then optional bullet list.
function SectionBlock({ heading, paragraphs = [], bullets = [] }) {
  return (
    <>
      <Text style={styles.sectionHeading} accessibilityRole="header">
        {heading}
      </Text>
      {paragraphs.map((p) => (
        <Text key={p} style={styles.body}>
          {p}
        </Text>
      ))}
      {bullets.map((b) => (
        // The bullet is visual only; VoiceOver reads just the sentence.
        <Text key={b} style={styles.bullet} accessibilityLabel={b}>
          {'•  '}
          {b}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 28, paddingTop: 24, paddingBottom: 48 },
  heading: {
    fontFamily: fonts.serifBold,
    fontSize: 26,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  sectionHeading: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: colors.primary,
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  bullet: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 8,
    paddingLeft: 4,
  },
  // 44pt minimum touch target for the email link.
  emailButton: { minHeight: 44, justifyContent: 'center' },
  emailText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  updated: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 24,
  },
});
