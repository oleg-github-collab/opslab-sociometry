package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Manager struct {
	secret []byte
}

type Claims struct {
	Code    string `json:"code"`
	IsAdmin bool   `json:"isAdmin"`
	jwt.RegisteredClaims
}

func NewManager(secret string) *Manager {
	if secret == "" {
		secret = "dev-secret-change-me"
	}
	return &Manager{secret: []byte(secret)}
}

func (m *Manager) Issue(code string, admin bool) (string, error) {
	claims := Claims{
		Code:    code,
		IsAdmin: admin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *Manager) Parse(token string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := parsed.Claims.(*Claims); ok && parsed.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}
