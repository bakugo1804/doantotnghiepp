import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null;

          const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
          const res = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password }),
          });

          if (!res.ok) return null;

          const data = await res.json();
          if (!data.access_token || !data.user) return null;

          return { ...data.user, accessToken: data.access_token };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.accessToken = (user as any).accessToken;
        token.role = (user as any).role;
        token.fullName = (user as any).fullName;
        token.avatarUrl = (user as any).avatarUrl;
        token.email = (user as any).email;
        token.companyId = (user as any).companyId;
      }
      if (trigger === 'update' && session?.user) {
        token.fullName = (session.user as any).fullName ?? session.user.name ?? token.fullName;
        token.avatarUrl = (session.user as any).avatarUrl ?? session.user.image ?? token.avatarUrl;
        token.email = session.user.email ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user) return session;
      (session.user as any).accessToken = token.accessToken;
      (session.user as any).role = token.role;
      (session.user as any).id = token.sub;
      (session.user as any).fullName = token.fullName;
      (session.user as any).avatarUrl = token.avatarUrl;
      (session.user as any).companyId = token.companyId;
      session.user.name = (token.fullName as string) || session.user.name;
      session.user.email = (token.email as string) || session.user.email;
      session.user.image = (token.avatarUrl as string) || session.user.image;
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
