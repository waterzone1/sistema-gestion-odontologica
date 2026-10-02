import { Alert } from '@/components/ui/alert'
import { errorMessage, passwordProblems } from '@/lib/api'

export function FormError({ error, className }: { error: unknown; className?: string }) {
  const message = errorMessage(error)
  if (!message) return null
  const problems = passwordProblems(error)
  return (
    <Alert className={className}>
      <p>{message}</p>
      {problems.length > 0 && (
        <ul className="list-disc pl-4">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
