import { cn } from '@/lib/cn'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card ({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-fond-card rounded-xl border border-bordure shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader ({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('px-6 py-5 border-b border-bordure', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardContent ({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('px-6 py-5', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter ({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('px-6 py-4 border-t border-bordure bg-fond-alt/50 rounded-b-xl', className)}
      {...props}
    >
      {children}
    </div>
  )
}
