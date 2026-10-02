import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Static files and internal Next.js paths bypass immediately
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Fast-path role check via instant cookie — ZERO external network latency
  const roleCookie = request.cookies.get('knitnect_role')?.value;

  // If unauthenticated and not on /login, redirect to /login
  if (!roleCookie && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If authenticated employee trying to access executive routes
  if (roleCookie === 'employee' && pathname !== '/login') {
    const executiveRoutes = [
      '/dashboard',
      '/styles',
      '/pipeline',
      '/departments',
      '/tasks',
      '/dispatch',
      '/payments',
      '/payroll',
      '/audit',
    ];

    const isAccessingExecutive = executiveRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    );

    if (isAccessingExecutive) {
      return NextResponse.redirect(new URL('/employee/tasks', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
