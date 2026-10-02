const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 128

const CLAVES_COMUNES = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  'password12',
  'password123',
  'contrasena1',
  'contrasena123',
  'qwertyuiop',
  'qwerty12345',
  'abcdefghij',
  'abc1234567',
  'iloveyou12',
  'admin12345',
  'administrador',
  'bienvenido1',
  'bienvenido123',
  'argentina123',
  'boca123456',
  'riverplate1',
])

export function checkPassword(password: string, username: string): string[] {
  const problemas: string[] = []
  if (password.length < PASSWORD_MIN_LENGTH) {
    problemas.push(`Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problemas.push(`No puede superar los ${PASSWORD_MAX_LENGTH} caracteres`)
  }
  const normalizada = password.toLowerCase()
  if (CLAVES_COMUNES.has(normalizada)) {
    problemas.push('Es una contraseña demasiado común')
  }
  if (username && normalizada.includes(username.toLowerCase())) {
    problemas.push('No puede contener el nombre de usuario')
  }
  if (password.length > 0 && new Set(password).size === 1) {
    problemas.push('No puede repetir un solo carácter')
  }
  return problemas
}
