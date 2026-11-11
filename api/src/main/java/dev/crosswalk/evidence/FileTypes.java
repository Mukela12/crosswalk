package dev.crosswalk.evidence;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;

/**
 * Upload allowlist. The type comes from the file's leading bytes, never from the
 * browser's Content-Type or the extension alone, and the stored name is rebuilt
 * from a safe character set with the detected extension.
 */
final class FileTypes {

    record FileType(String extension, String contentType) {}

    static final FileType PDF = new FileType("pdf", "application/pdf");
    static final FileType PNG = new FileType("png", "image/png");
    static final FileType JPEG = new FileType("jpg", "image/jpeg");
    static final FileType CSV = new FileType("csv", "text/csv");
    static final FileType TXT = new FileType("txt", "text/plain");

    private FileTypes() {}

    static Optional<FileType> detect(byte[] bytes, String originalName) {
        if (bytes.length == 0) {
            return Optional.empty();
        }
        if (startsWith(bytes, '%', 'P', 'D', 'F', '-')) {
            return Optional.of(PDF);
        }
        if (startsWith(bytes, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) {
            return Optional.of(PNG);
        }
        if (startsWith(bytes, 0xFF, 0xD8, 0xFF)) {
            return Optional.of(JPEG);
        }
        String ext = extension(originalName);
        if ((ext.equals("csv") || ext.equals("txt")) && isPlainUtf8Text(bytes)) {
            return Optional.of(ext.equals("csv") ? CSV : TXT);
        }
        return Optional.empty();
    }

    static String safeName(String originalName, FileType type) {
        String name = originalName == null ? "" : originalName;
        name = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
        int dot = name.lastIndexOf('.');
        String stem = dot > 0 ? name.substring(0, dot) : name;
        stem = stem.replaceAll("[^A-Za-z0-9._-]+", "-").replaceAll("^[.-]+|[.-]+$", "");
        if (stem.isEmpty()) {
            stem = "evidence";
        }
        if (stem.length() > 80) {
            stem = stem.substring(0, 80);
        }
        return stem + "." + type.extension();
    }

    private static String extension(String name) {
        if (name == null) {
            return "";
        }
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static boolean isPlainUtf8Text(byte[] bytes) {
        for (byte b : bytes) {
            if (b == 0) {
                return false;
            }
        }
        try {
            StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }

    private static boolean startsWith(byte[] bytes, int... prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if ((bytes[i] & 0xFF) != prefix[i]) {
                return false;
            }
        }
        return true;
    }
}
