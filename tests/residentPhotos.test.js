// utils/residentPhotos.js: resizing maths, the upload order (file first,
// doc second, file removed again if the doc fails), and deletion.
import { firestore, storageModule } from './mocks/firebase';

// Native modules have no JS implementation under Jest — stub them.
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

const {
  deleteResidentPhoto,
  fitWithin,
  photoStoragePath,
  uploadResidentPhoto,
} = require('../utils/residentPhotos');

const photo = { uri: 'file:///p.jpg', width: 1600, height: 1200 };

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ blob: async () => 'BLOB' }));
});

describe('fitWithin', () => {
  it('shrinks the long edge to 1600 and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 800, height: 1600 });
  });

  it('never enlarges a small photo', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('uploadResidentPhoto', () => {
  it('uploads the JPEG with the uploader stamped, then writes the doc (no URL)', async () => {
    const id = await uploadResidentPhoto({
      residentId: 'r1',
      photo,
      caption: '  At the lake  ',
      uploaderName: 'Fran',
    });
    expect(id).toBe('new-id');
    expect(storageModule.uploadBytes).toHaveBeenCalledWith(
      { fullPath: 'residents/r1/photos/new-id.jpg' },
      'BLOB',
      { contentType: 'image/jpeg', customMetadata: { uploadedBy: 'test-uid' } }
    );
    expect(firestore.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'residents/r1/photos/new-id' }),
      {
        storagePath: 'residents/r1/photos/new-id.jpg',
        caption: 'At the lake',
        uploadedBy: 'test-uid',
        uploaderName: 'Fran',
        uploadedAt: firestore.serverTimestamp.mock.results[0]?.value,
        width: 1600,
        height: 1200,
      }
    );
  });

  it("doesn't write the doc if the file upload fails", async () => {
    storageModule.uploadBytes.mockRejectedValueOnce(new Error('offline'));
    await expect(
      uploadResidentPhoto({ residentId: 'r1', photo, uploaderName: 'Fran' })
    ).rejects.toThrow('offline');
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it('removes the uploaded file if the doc write fails, so nothing is orphaned', async () => {
    firestore.setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'x' }));
    await expect(
      uploadResidentPhoto({ residentId: 'r1', photo, uploaderName: 'Fran' })
    ).rejects.toThrow('denied');
    expect(storageModule.deleteObject).toHaveBeenCalledWith({
      fullPath: photoStoragePath('r1', 'new-id'),
    });
  });
});

describe('deleteResidentPhoto', () => {
  const target = { id: 'p1', storagePath: 'residents/r1/photos/p1.jpg' };

  it('removes the file and then the doc', async () => {
    await deleteResidentPhoto('r1', target);
    expect(storageModule.deleteObject).toHaveBeenCalledWith({ fullPath: target.storagePath });
    expect(firestore.deleteDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'residents/r1/photos/p1' })
    );
  });

  it('still removes the doc when the file is already gone', async () => {
    storageModule.deleteObject.mockRejectedValueOnce({ code: 'storage/object-not-found' });
    await deleteResidentPhoto('r1', target);
    expect(firestore.deleteDoc).toHaveBeenCalled();
  });

  it('keeps the doc if the file could not be removed', async () => {
    storageModule.deleteObject.mockRejectedValueOnce({ code: 'storage/unauthorized' });
    await expect(deleteResidentPhoto('r1', target)).rejects.toEqual({
      code: 'storage/unauthorized',
    });
    expect(firestore.deleteDoc).not.toHaveBeenCalled();
  });
});
