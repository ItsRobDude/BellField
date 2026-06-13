import { Pressable, Text, TextInput, View } from 'react-native';
import type { BellFieldTranslator } from '@bellfield/i18n';
import type { AppointmentFinishOutcome } from '@/lib/operations-api';
import { formatFinishOutcome } from './field-pending-replay';
import type { FieldMediaSource } from './field-media-capture';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FinishReviewState } from './field-workspace-drafts';

const finishOutcomes: AppointmentFinishOutcome[] = ['completed', 'followUpNeeded', 'noAccess'];

type AppointmentFinishReviewCardProps = {
  appointmentId: string;
  finishReview: FinishReviewState;
  t: BellFieldTranslator;
  onCancel: () => void;
  onSave: () => void;
  onUpdate: (appointmentId: string, patch: Partial<FinishReviewState>) => void;
};

export function AppointmentFinishReviewCard({
  appointmentId,
  finishReview,
  t,
  onCancel,
  onSave,
  onUpdate
}: AppointmentFinishReviewCardProps) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.sectionTitleSmall}>{t('fieldFinishReview.title')}</Text>
      <Text style={styles.summaryText}>{t('fieldFinishReview.prompt')}</Text>
      <Text style={styles.summaryText}>
        {t('fieldFinishReview.outcome')}: {formatFinishOutcome(finishReview.finishOutcome, t)}
      </Text>
      <View style={styles.actionRow}>
        {finishOutcomes.map((outcome) => (
          <Pressable
            key={outcome}
            onPress={() => onUpdate(appointmentId, { finishOutcome: outcome })}
            style={styles.tagButton}
          >
            <Text style={styles.tagButtonText}>{formatFinishOutcome(outcome, t)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.summaryText}>
        {t('fieldFinishReview.chargeActivity')}:{' '}
        {finishReview.hasChargeActivity ? t('common.yes') : t('common.no')}
      </Text>
      <View style={styles.actionRow}>
        <Pressable
          onPress={() => onUpdate(appointmentId, { hasChargeActivity: true })}
          style={styles.tagButton}
        >
          <Text style={styles.tagButtonText}>{t('fieldFinishReview.chargesAdded')}</Text>
        </Pressable>
        <Pressable
          onPress={() => onUpdate(appointmentId, { hasChargeActivity: false })}
          style={styles.tagButton}
        >
          <Text style={styles.tagButtonText}>{t('fieldFinishReview.noCharges')}</Text>
        </Pressable>
      </View>
      <TextInput
        value={finishReview.visitNotes}
        onChangeText={(visitNotes) => onUpdate(appointmentId, { visitNotes })}
        multiline
        placeholder={t('fieldFinishReview.visitNotesPlaceholder')}
        style={styles.input}
      />
      <TextInput
        value={finishReview.registerReminder}
        onChangeText={(registerReminder) => onUpdate(appointmentId, { registerReminder })}
        multiline
        placeholder={t('fieldFinishReview.registerReminderPlaceholder')}
        style={styles.input}
      />
      <View style={styles.actionRow}>
        <Pressable onPress={onSave} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{t('fieldFinishReview.saveFinishLocally')}</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('fieldWorkspace.actions.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type AppointmentMediaCardProps = {
  caption: string;
  t: BellFieldTranslator;
  onCaptureMedia: (source: FieldMediaSource) => void;
  onChangeCaption: (caption: string) => void;
};

export function AppointmentMediaCard({
  caption,
  t,
  onCaptureMedia,
  onChangeCaption
}: AppointmentMediaCardProps) {
  return (
    <View style={styles.reviewCard}>
      <Text style={styles.sectionTitleSmall}>{t('fieldCapture.appointmentMediaTitle')}</Text>
      <TextInput
        value={caption}
        onChangeText={onChangeCaption}
        placeholder={t('fieldCapture.optionalVisitCaption')}
        style={styles.input}
      />
      <View style={styles.actionRow}>
        <Pressable onPress={() => onCaptureMedia('camera')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('fieldCapture.captureMedia')}</Text>
        </Pressable>
        <Pressable onPress={() => onCaptureMedia('library')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('fieldCapture.pickFromLibrary')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
