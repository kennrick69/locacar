<?php
/**
 * LocaCar - Email sender via PHPMailer
 * Lê parâmetros em JSON do stdin, envia o email e retorna JSON para stdout.
 *
 * Parâmetros esperados:
 *   smtp_host, smtp_port, smtp_user, smtp_pass
 *   from_name, to, subject, html
 *   attachment_filename (opcional), attachment_base64 (opcional), attachment_mime (opcional)
 */

require __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

$input = file_get_contents('php://stdin');
$params = json_decode($input, true);

if (!$params) {
    echo json_encode(['success' => false, 'error' => 'JSON de entrada inválido']);
    exit(1);
}

$required = ['smtp_user', 'smtp_pass', 'to', 'subject', 'html'];
foreach ($required as $field) {
    if (empty($params[$field])) {
        echo json_encode(['success' => false, 'error' => "Campo obrigatório ausente: $field"]);
        exit(1);
    }
}

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = $params['smtp_host'] ?? 'smtp.gmail.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = $params['smtp_user'];
    $mail->Password   = $params['smtp_pass'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = (int)($params['smtp_port'] ?? 587);
    $mail->CharSet    = 'UTF-8';
    $mail->Timeout    = 15;

    $mail->setFrom($params['smtp_user'], $params['from_name'] ?? 'LocaCar');
    $mail->addAddress($params['to']);

    $mail->isHTML(true);
    $mail->Subject = $params['subject'];
    $mail->Body    = $params['html'];

    if (!empty($params['attachment_base64']) && !empty($params['attachment_filename'])) {
        $content = base64_decode($params['attachment_base64']);
        $mime    = $params['attachment_mime'] ?? 'application/pdf';
        $mail->addStringAttachment($content, $params['attachment_filename'], PHPMailer::ENCODING_BASE64, $mime);
    }

    $mail->send();
    echo json_encode(['success' => true]);
    exit(0);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $mail->ErrorInfo]);
    exit(1);
}
