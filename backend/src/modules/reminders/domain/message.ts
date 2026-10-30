export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('54')) {
    const rest = digits.slice(2).replace(/^9/, '').replace(/^0/, '')
    digits = `549${rest}`
  } else {
    digits = `549${digits.replace(/^0/, '')}`
  }
  const national = digits.slice(3).replace(/^(\d{2,4})15/, '$1')
  digits = `549${national}`
  return digits.length === 13 ? digits : null
}

export function whatsappLink(phone: string | null, message: string): string | null {
  const number = whatsappNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
}
