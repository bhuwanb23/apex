import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Saves or shares a generated PDF end to end:
 *  - Web: triggers a browser download (blob URL + anchor click).
 *  - Native: writes the bytes to the app cache and opens the system share
 *    sheet so the user can save or send the file.
 * @param bytes   PDF bytes from the backend report endpoint
 * @param filename  e.g. "LeBron-James-risk-report.pdf"
 */
export async function saveOrSharePdf(bytes: ArrayBuffer, filename: string): Promise<void> {
  const blob = new Blob([bytes], { type: 'application/pdf' });

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // Native: write to the cache dir, then open the share sheet with it.
  const file = new File(Paths.cache, filename);
  await file.write(new Uint8Array(bytes));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Export risk report',
      UTI: 'com.adobe.pdf',
    });
  } else {
    throw new Error('Sharing is not available on this device');
  }
}
