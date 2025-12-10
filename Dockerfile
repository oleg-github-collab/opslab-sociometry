FROM golang:1.24-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/opslab-survey ./cmd/server

FROM alpine:3.19
WORKDIR /app
RUN adduser -D runner
USER runner
COPY --from=builder /out/opslab-survey /app/opslab-survey
ENV PORT=8080
EXPOSE 8080
CMD ["/app/opslab-survey"]
