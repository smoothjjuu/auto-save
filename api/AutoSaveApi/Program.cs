var builder = WebApplication.CreateBuilder(args);

// 1. CONFIGURE CORS
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

// 2. SIMULATED DATABASE (Static Memory Dictionary)
var store = new DocumentStore();

// 3. Endpoints
app.MapGet("/", () => "API is running!"); 

// --- GET ALL DOCUMENTS ---
app.MapGet("/documents", () => {
    var now = DateTime.UtcNow;
    return Results.Ok(store.Documents.Values.Select(d => new { 
        d.Id, 
        d.Title, 
        IsLocked = d.LockedUntil > now,
        LockedBy = d.LockedUntil > now ? d.LockedBy : null
    }));
});

// --- CREATE NEW DOCUMENT ---
app.MapPost("/documents", () => {
    var id = Guid.NewGuid().ToString();
    var doc = new Document(id, "Untitled Document", "", 1);
    store.Documents[id] = doc;
    return Results.Created($"/documents/{id}", doc);
});

// --- GET SPECIFIC DOCUMENT (CLAIM LOCK) ---
app.MapGet("/documents/{id}", (string id, string? userName) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    // Auto-Lock when fetching for editing
    if (!string.IsNullOrEmpty(userName)) {
        var now = DateTime.UtcNow;
        // Only allow locking if not locked by someone else
        if (doc.LockedUntil < now || doc.LockedBy == userName) {
            doc = doc with { LockedBy = userName, LockedUntil = now.AddSeconds(60) };
            store.Documents[id] = doc;
            Console.WriteLine($"[LOCKED] Doc {id} by {userName} until {doc.LockedUntil}");
        }
    }
    
    return Results.Ok(doc);
});

// --- SAVE/UPDATE DOCUMENT ---
app.MapPut("/documents/{id}", (string id, string? userName, Document updatedDoc) => {
    if (!store.Documents.TryGetValue(id, out var existingDoc)) return Results.NotFound();

    var now = DateTime.UtcNow;
    // Check Lock: If locked by someone else and lock hasn't expired yet
    if (existingDoc.LockedUntil > now && existingDoc.LockedBy != userName) {
        return Results.Json(new { message = "Document is locked by " + existingDoc.LockedBy }, statusCode: 423);
    }

    // --- OPTIMISTIC LOCKING ENGINE ---
    if (updatedDoc.Version != existingDoc.Version) {
        return Results.Conflict(new { message = "409 Conflict", serverVersion = existingDoc.Version });
    }

    // --- SUCCESS PATH ---
    var newDoc = updatedDoc with { 
        Version = updatedDoc.Version + 1,
        LockedBy = userName,
        LockedUntil = now.AddSeconds(60) // Extend lock on save
    };
    store.Documents[id] = newDoc;
    Console.WriteLine($"[SAVED] Doc {id} - New Server Version: {newDoc.Version}");
    
    return Results.Ok(new { version = newDoc.Version });
});

// --- DELETE DOCUMENT ---
app.MapDelete("/documents/{id}", (string id, string? userName) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();

    var now = DateTime.UtcNow;
    // If locked by someone else, prevent deletion
    if (doc.LockedUntil > now && doc.LockedBy != userName) {
        return Results.Json(new { message = "Cannot delete: Document is locked by " + doc.LockedBy }, statusCode: 423);
    }

    store.Documents.Remove(id);
    Console.WriteLine($"[DELETED] Doc {id} removed from store.");
    return Results.NoContent();
});

// --- HEARTBEAT / RENEW LOCK ---
app.MapPost("/documents/{id}/heartbeat", (string id, string userName) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    var now = DateTime.UtcNow;
    if (doc.LockedUntil < now || doc.LockedBy == userName) {
        doc = doc with { LockedBy = userName, LockedUntil = now.AddSeconds(60) };
        store.Documents[id] = doc;
        return Results.Ok(new { lockedUntil = doc.LockedUntil });
    }
    
    return Results.Json(new { message = "Lock lost to " + doc.LockedBy }, statusCode: 423);
});

// --- UNLOCK DOCUMENT (INSTANT RELEASE) ---
app.MapPost("/documents/{id}/unlock", (string id, string userName) => {
    if (!store.Documents.TryGetValue(id, out var doc)) return Results.NotFound();
    
    if (doc.LockedBy == userName) {
        doc = doc with { LockedBy = null, LockedUntil = null };
        store.Documents[id] = doc;
        Console.WriteLine($"[UNLOCKED] Doc {id} released by {userName}.");
        return Results.Ok();
    }
    return Results.BadRequest("You do not hold the lock for this document.");
});

app.Run();

// 4. Models
public record Document(
    string Id, 
    string Title, 
    string Content, 
    int Version, 
    DateTime? LockedUntil = null, 
    string? LockedBy = null
);

public class DocumentStore {
    public Dictionary<string, Document> Documents { get; set; } = new () {
        { "initial-doc", new Document("initial-doc", "My First Document", "Hello from the multi-document store!", 1) }
    };
}
