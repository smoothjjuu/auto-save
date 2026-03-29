var builder = WebApplication.CreateBuilder(args);

// 1. CONFIGURE CORS
// During development, we allow localhost:4200. 
// In production, we'll allow all origins for this demo.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy => 
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader());
});

// 2. Add Swagger/OpenAPI services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Ensure the app listens on the port provided by the environment (e.g., Render/Azure)
var port = Environment.GetEnvironmentVariable("PORT") ?? "5202";
builder.WebHost.UseUrls($"http://*:{port}");

var app = builder.Build();

// 3. Enable Swagger UI
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");

// 2. SIMULATED DATABASE (Static Memory)
var store = new DocumentStore();

// 3. Endpoints
app.MapGet("/", () => "API is running!"); // Health check for Render

app.MapGet("/document", () => Results.Ok(store.Current));

// --- ENDPOINT: SAVE DOCUMENT ---
app.MapPut("/document", (Document updatedDoc) => {
    // --- OPTIMISTIC LOCKING ENGINE ---
    if (updatedDoc.Version != store.Current.Version) {
        Console.WriteLine($"[CONFLICT] Client v{updatedDoc.Version} != Server v{store.Current.Version}");
        return Results.Conflict(new { message = "409 Conflict", serverVersion = store.Current.Version });
    }

    // --- SUCCESS PATH ---
    store.Current = updatedDoc with { Version = updatedDoc.Version + 1 };
    Console.WriteLine($"[SAVED] New Server Version: {store.Current.Version}");
    
    return Results.Ok(new { version = store.Current.Version });
});

app.Run();

// 4. Models
public record Document(string Title, string Content, int Version);

public class DocumentStore {
    public Document Current { get; set; } = new Document("", "", 1);
}
