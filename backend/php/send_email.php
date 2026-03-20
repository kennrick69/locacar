<?php
/**
 * IMP Locadora - Email sender via PHP mail()
 * Usa o sendmail local do Railway (sem SMTP externo).
 * Lê parâmetros em JSON do stdin, retorna JSON no stdout.
 */
$input = file_get_contents('php://stdin');
$params = json_decode($input, true);

if (!$params || empty($params['to']) || empty($params['subject']) || empty($params['html'])) {
    echo json_encode(['success' => false, 'error' => 'Parâmetros inválidos']);
    exit(1);
}

$to        = $params['to'];
$fromName  = $params['from_name']  ?? 'IMP Locadora';
$fromEmail = $params['from_email'] ?? 'no-reply@implocadora.com.br';
$subject   = '=?UTF-8?B?' . base64_encode($params['subject']) . '?=';
$html      = $params['html'];

if (!empty($params['attachment_base64']) && !empty($params['attachment_filename'])) {
    $boundary = 'boundary_' . md5(uniqid());

    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n";
    $headers .= "From: {$fromName} <{$fromEmail}>\r\n";

    $body  = "--{$boundary}\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
    $body .= $html . "\r\n";

    $body .= "--{$boundary}\r\n";
    $body .= "Content-Type: " . ($params['attachment_mime'] ?? 'application/pdf') . "\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"" . $params['attachment_filename'] . "\"\r\n\r\n";
    $body .= chunk_split($params['attachment_base64']) . "\r\n";
    $body .= "--{$boundary}--";
} else {
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$fromName} <{$fromEmail}>\r\n";
    $body = $html;
}

if (mail($to, $subject, $body, $headers)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'mail() retornou false']);
    exit(1);
}
